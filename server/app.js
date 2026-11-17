import { describeConnector, missingRequired, splitValues } from './connectors/define.js'
import { connectors, getConnector } from './connectors/index.js'
import { removeUploads, saveUpload } from './connectors/csv.js'
import { safeEqual } from './lib/crypto.js'
import { ApiError, createRouter } from './lib/router.js'
import { discoverPaths, ENTITY_ORDER, suggestFieldMapping, TARGET_SCHEMA, applyEntityMapping } from '../shared/mapping/index.js'
import { connectionsRepo } from './repo/connections.js'
import { portfolioRepo } from './repo/portfolio.js'
import { tenantsRepo } from './repo/tenants.js'
import { buildContext, runSync, sampleStream } from './sync/engine.js'
import { registerAssistantRoutes } from './assistant/routes.js'

// REST API.
//   /api/admin/*          platform admin (X-Admin-Token)       — manage tenants
//   /api/*                tenant API key (Authorization: Bearer vrr_…)
// Every tenant route resolves req.tenant from the key and passes tenant.id to
// the repositories — there is no way to address another tenant's data.

const SCHEDULES = [null, 15, 60, 360, 1440]

export function createApp({ db, dataDir, adminToken, llm, docs }) {
  const router = createRouter()
  const tenants = tenantsRepo(db)

  const requireAdmin = (req) => {
    const token = req.headers['x-admin-token']
    if (!adminToken || !token || !safeEqual(String(token), adminToken)) throw new ApiError(401, 'Admin token required')
  }
  const requireTenant = (req) => {
    const header = req.headers.authorization ?? ''
    const tenant = tenants.authenticate(header.replace(/^Bearer\s+/i, ''))
    if (!tenant) throw new ApiError(401, 'Invalid or missing tenant API key')
    req.tenant = tenant
    req.connections = connectionsRepo(db, tenant.id)
    req.portfolio = portfolioRepo(db, tenant.id)
  }
  const loadConnection = (req) => {
    const conn = req.connections.get(req.params.id, { withSecrets: true })
    if (!conn) throw new ApiError(404, 'Connection not found')
    req.connection = conn
    req.connector = getConnector(conn.connector)
  }
  const publicConn = ({ secrets: _secrets, ...rest }) => rest
  const ctxFor = (req) => buildContext({ db, dataDir, tenantId: req.tenant.id, connection: req.connection })
  const wrapConnectorError = (e) => new ApiError(e.status && e.status < 500 ? 400 : 502, e.message)

  // ── health ───────────────────────────────────────────────────────────────
  router.get('/api/health', () => ({ ok: true, connectors: [...connectors.keys()] }))

  // ── admin: tenants ──────────────────────────────────────────────────────
  router.get('/api/admin/tenants', requireAdmin, () => tenants.list())
  router.post('/api/admin/tenants', requireAdmin, (req) => {
    const name = String(req.body?.name ?? '').trim()
    if (!name) throw new ApiError(400, 'name is required')
    return tenants.create(name)
  })
  router.post('/api/admin/tenants/:tid/rotate-key', requireAdmin, (req) => {
    if (!tenants.get(req.params.tid)) throw new ApiError(404, 'Tenant not found')
    return { apiKey: tenants.rotateKey(req.params.tid) }
  })
  router.delete('/api/admin/tenants/:tid', requireAdmin, (req) => {
    for (const c of connectionsRepo(db, req.params.tid).list()) removeUploads({ dataDir, tenantId: req.params.tid, connectionId: c.id })
    tenants.remove(req.params.tid)
  })

  // ── tenant: identity & catalog ──────────────────────────────────────────
  router.get('/api/me', requireTenant, (req) => ({ tenant: req.tenant, counts: req.portfolio.counts() }))
  router.get('/api/connectors', requireTenant, () => [...connectors.values()].map(describeConnector))
  router.get('/api/schema', requireTenant, () => ({ entities: TARGET_SCHEMA, order: ENTITY_ORDER, schedules: SCHEDULES }))

  // ── tenant: connections ─────────────────────────────────────────────────
  router.get('/api/connections', requireTenant, (req) => req.connections.list())
  router.post('/api/connections', requireTenant, (req) => {
    const { name, connector: connectorId, values = {}, schedule_minutes = null } = req.body ?? {}
    if (!name?.trim()) throw new ApiError(400, 'name is required')
    let connector
    try {
      connector = getConnector(connectorId)
    } catch (e) {
      throw new ApiError(400, e.message)
    }
    let split
    try {
      split = splitValues(connector, values)
    } catch (e) {
      throw new ApiError(400, e.message)
    }
    if (!SCHEDULES.includes(schedule_minutes)) throw new ApiError(400, `schedule_minutes must be one of ${SCHEDULES.join(', ')}`)
    // Seed mappings from connector presets so the editor starts useful.
    const mapping = Object.fromEntries(Object.entries(connector.presets ?? {}).map(([e, p]) => [e, { enabled: connectorId === 'demo', ...p }]))
    return req.connections.create({ name: name.trim(), connector: connectorId, ...split, mapping, schedule_minutes })
  })
  router.get('/api/connections/:id', requireTenant, loadConnection, (req) => publicConn(req.connection))
  router.patch('/api/connections/:id', requireTenant, loadConnection, (req) => {
    const { name, values, mapping, schedule_minutes, enabled } = req.body ?? {}
    const patch = { name, mapping, enabled }
    if (schedule_minutes !== undefined) {
      if (!SCHEDULES.includes(schedule_minutes)) throw new ApiError(400, `schedule_minutes must be one of ${SCHEDULES.join(', ')}`)
      patch.schedule_minutes = schedule_minutes
    }
    if (values) {
      try {
        const { config, secrets } = splitValues(req.connector, { ...req.connection.config, ...values })
        patch.config = config
        // Only secrets actually sent are changed.
        patch.secrets = Object.fromEntries(Object.entries(secrets).filter(([k]) => k in values))
      } catch (e) {
        throw new ApiError(400, e.message)
      }
    }
    if (mapping) {
      for (const e of Object.keys(mapping)) if (!TARGET_SCHEMA[e]) throw new ApiError(400, `Unknown entity "${e}" in mapping`)
    }
    return req.connections.update(req.params.id, patch)
  })
  router.delete('/api/connections/:id', requireTenant, loadConnection, (req) => {
    removeUploads({ dataDir, tenantId: req.tenant.id, connectionId: req.params.id })
    req.connections.remove(req.params.id, { purgeData: req.query.keepData !== 'true' })
  })

  router.post('/api/connections/:id/test', requireTenant, loadConnection, async (req) => {
    const missing = missingRequired(req.connector, req.connection.config, req.connection.secrets)
    if (missing.length) return { ok: false, message: `Missing: ${missing.join(', ')}` }
    try {
      return await req.connector.test(ctxFor(req))
    } catch (e) {
      return { ok: false, message: e.message }
    }
  })
  router.get('/api/connections/:id/streams', requireTenant, loadConnection, async (req) => {
    try {
      return await req.connector.listStreams(ctxFor(req))
    } catch (e) {
      throw wrapConnectorError(e)
    }
  })
  router.get('/api/connections/:id/streams/:stream/sample', requireTenant, loadConnection, async (req) => {
    try {
      const records = await sampleStream({ db, dataDir, tenantId: req.tenant.id, connection: req.connection, stream: req.params.stream, limit: Math.min(Number(req.query.limit) || 25, 100) })
      return { records, paths: discoverPaths(records) }
    } catch (e) {
      throw wrapConnectorError(e)
    }
  })
  router.post('/api/connections/:id/suggest', requireTenant, loadConnection, async (req) => {
    const { entity, stream } = req.body ?? {}
    if (!TARGET_SCHEMA[entity]) throw new ApiError(400, 'Unknown entity')
    try {
      const records = await sampleStream({ db, dataDir, tenantId: req.tenant.id, connection: req.connection, stream, limit: 50 })
      return { fields: suggestFieldMapping(entity, discoverPaths(records)) }
    } catch (e) {
      throw wrapConnectorError(e)
    }
  })
  // Dry-run a mapping against live sample records.
  router.post('/api/connections/:id/preview', requireTenant, loadConnection, async (req) => {
    const { entity, mapping } = req.body ?? {}
    if (!TARGET_SCHEMA[entity]) throw new ApiError(400, 'Unknown entity')
    try {
      const records = await sampleStream({ db, dataDir, tenantId: req.tenant.id, connection: req.connection, stream: mapping.stream, limit: 25 })
      const result = applyEntityMapping(records, entity, mapping)
      let unmatched = 0
      if (entity !== 'accounts') {
        const resolve = req.portfolio.resolver(req.connection.id, mapping.accountMatch ?? 'same_source')
        for (const r of result.rows) {
          r.__account = resolve(r.account_id)
          if (!r.__account) unmatched++
        }
      }
      return { ...result, rejected: result.rejected.slice(0, 10), sampleSize: records.length, unmatched }
    } catch (e) {
      throw wrapConnectorError(e)
    }
  })
  router.post('/api/connections/:id/upload', requireTenant, loadConnection, (req) => {
    if (req.connection.connector !== 'csv') throw new ApiError(400, 'Uploads are only supported on CSV connections')
    const { filename, content } = req.body ?? {}
    if (!filename || typeof content !== 'string') throw new ApiError(400, 'filename and content are required')
    return saveUpload({ dataDir, tenantId: req.tenant.id, connectionId: req.connection.id, filename, content })
  })

  router.post('/api/connections/:id/sync', requireTenant, loadConnection, async (req) => {
    const mode = req.body?.mode === 'full' ? 'full' : 'incremental'
    if (req.body?.resetCursors) req.connections.clearCursors(req.params.id)
    return runSync({ db, dataDir, tenantId: req.tenant.id, connectionId: req.params.id, trigger: 'manual', mode, entities: req.body?.entities })
  })
  router.get('/api/connections/:id/runs', requireTenant, loadConnection, (req) => req.connections.listRuns(req.params.id, Math.min(Number(req.query.limit) || 20, 100)))

  // ── tenant: portfolio (read by the VRR dashboard) ───────────────────────
  router.get('/api/portfolio', requireTenant, (req) => req.portfolio.snapshot())
  router.get('/api/portfolio/activity/:accountId', requireTenant, (req) => req.portfolio.activity(req.params.accountId, Math.min(Number(req.query.limit) || 6, 50)))
  router.post('/api/portfolio/interventions', requireTenant, (req) => {
    const { account_id, type, details } = req.body ?? {}
    if (!account_id || !type) throw new ApiError(400, 'account_id and type are required')
    return { id: req.portfolio.startIntervention(account_id, type, details ?? {}) }
  })
  router.post('/api/portfolio/interventions/:iid/resolve', requireTenant, (req) => {
    req.portfolio.resolveIntervention(Number(req.params.iid))
  })
  router.post('/api/portfolio/projects/:pid/blocker', requireTenant, (req) => {
    const p = req.portfolio.project(req.params.pid)
    if (!p) throw new ApiError(404, 'Project not found')
    const blocker = req.body?.blocker_type
    if (!blocker || blocker === 'None') {
      req.portfolio.setProjectOverride(p.id, { status: 'On Track', blocker_type: 'None' }, (x) => `${x.name} unblocked`)
    } else {
      req.portfolio.setProjectOverride(p.id, { status: p.status === 'On Track' ? 'Delayed' : p.status, blocker_type: blocker }, (x) => `${blocker} blocker logged on ${x.name}`)
    }
  })
  router.post('/api/portfolio/reset-app-data', requireTenant, (req) => {
    req.portfolio.clearAppData()
  })


  // ── assistant ───────────────────────────────────────────────────────────
  if (llm && docs) registerAssistantRoutes(router, { llm, docs, tenants, db })

  return router
}
