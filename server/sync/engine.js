import { applyEntityMapping, ENTITY_ORDER, TARGET_SCHEMA, validateMapping } from '../../shared/mapping/index.js'
import { missingRequired } from '../connectors/define.js'
import { getConnector } from '../connectors/index.js'
import { connectionsRepo } from '../repo/connections.js'
import { nowIso } from '../repo/db.js'
import { portfolioRepo } from '../repo/portfolio.js'

// Pull-based sync: connector.read() → mapping → validation → tenant-scoped upsert.
// Accounts sync first so child entities can resolve their account reference.

const UPSERT = { accounts: 'upsertAccounts', telemetry: 'upsertTelemetry', usage: 'upsertUsage', projects: 'upsertProjects' }
const PRUNE_TABLE = { accounts: 'accounts', telemetry: 'telemetry', usage: 'usage', projects: 'projects' }
const MAX_REJECT_SAMPLES = 10

export function buildContext({ db, dataDir, tenantId, connection, log = () => {} }) {
  const repo = connectionsRepo(db, tenantId)
  return {
    tenantId,
    connectionId: connection.id,
    config: connection.config,
    secrets: connection.secrets ?? {},
    dataDir,
    log,
    cache: new Map(),
    updateSecrets: (patch) => repo.patchSecrets(connection.id, patch),
  }
}

export async function runSync({ db, dataDir, tenantId, connectionId, trigger = 'manual', mode = 'incremental', entities }) {
  const connections = connectionsRepo(db, tenantId)
  const portfolio = portfolioRepo(db, tenantId)
  const connection = connections.get(connectionId, { withSecrets: true })
  if (!connection) throw new Error('Connection not found')
  if (connections.isRunning(connectionId)) throw new Error('A sync is already running for this connection')

  const connector = getConnector(connection.connector)
  const log = []
  const write = (msg) => log.push({ at: nowIso(), msg })
  const runId = connections.startRun(connectionId, { trigger, mode })
  const startedAt = nowIso()
  const stats = {}
  const ctx = buildContext({ db, dataDir, tenantId, connection, log: write })

  try {
    const missing = missingRequired(connector, connection.config, connection.secrets)
    if (missing.length) throw new Error(`Missing settings: ${missing.join(', ')}`)
    const enabled = ENTITY_ORDER.filter((e) => connection.mapping[e]?.enabled && (!entities || entities.includes(e)))
    if (!enabled.length) throw new Error('No entities are mapped yet — open the mapping editor and enable at least Accounts')

    for (const entity of enabled) {
      const mapping = connection.mapping[entity]
      const problems = validateMapping(entity, mapping)
      if (problems.length) {
        stats[entity] = { skipped: true, reason: problems.join('; ') }
        write(`${TARGET_SCHEMA[entity].label}: skipped — ${problems.join('; ')}`)
        continue
      }
      stats[entity] = await syncEntity({ ctx, connector, connections, portfolio, connection, entity, mapping, mode, write })
    }

    const failed = Object.values(stats).every((s) => s.skipped)
    const anyRejected = Object.values(stats).some((s) => s.rejected > 0)
    const status = failed ? 'failed' : anyRejected ? 'partial' : 'success'
    connections.finishRun(runId, { status, stats, log, error: failed ? 'All entities skipped' : null })
    connections.setStatus(connectionId, { status: status === 'failed' ? 'error' : 'ok', error: failed ? 'All entities skipped' : null, success: !failed })
    write(`Finished: ${status}`)
    return { runId, status, stats, startedAt }
  } catch (e) {
    write(`Error: ${e.message}`)
    connections.finishRun(runId, { status: 'failed', stats, log, error: e.message })
    connections.setStatus(connectionId, { status: 'error', error: e.message })
    return { runId, status: 'failed', stats, error: e.message, startedAt }
  }
}

async function syncEntity({ ctx, connector, connections, portfolio, connection, entity, mapping, mode, write }) {
  const label = TARGET_SCHEMA[entity].label
  const cursorKey = `${entity}:${mapping.stream}`
  const fullRefresh = mode === 'full' || mapping.syncMode === 'full'
  const startCursor = fullRefresh ? null : connections.getCursor(connection.id, cursorKey)
  const entityStart = nowIso()
  const resolve = entity === 'accounts' ? null : portfolio.resolver(connection.id, mapping.accountMatch ?? 'same_source')
  const s = { stream: mapping.stream, pulled: 0, written: 0, rejected: 0, unmatched: 0, pruned: 0, incremental: Boolean(startCursor), samples: [], unmappedValues: {} }
  let maxCursor = startCursor

  write(`${label}: pulling ${mapping.stream}${startCursor ? ` since ${startCursor}` : ' (full)'}`)
  for await (const batch of connector.read(ctx, mapping.stream, { cursor: startCursor })) {
    s.pulled += batch.records.length
    if (batch.cursor && (!maxCursor || batch.cursor > maxCursor)) maxCursor = batch.cursor
    const { rows, rejected, unmappedValues } = applyEntityMapping(batch.records, entity, mapping)
    for (const [field, values] of Object.entries(unmappedValues)) {
      s.unmappedValues[field] ??= {}
      for (const [v, n] of Object.entries(values)) s.unmappedValues[field][v] = (s.unmappedValues[field][v] ?? 0) + n
    }
    s.rejected += rejected.length
    for (const r of rejected) if (s.samples.length < MAX_REJECT_SAMPLES) s.samples.push({ reasons: r.reasons })

    let ready = rows
    if (resolve) {
      ready = []
      for (const row of rows) {
        const accountId = resolve(row.account_id)
        if (!accountId) {
          s.unmatched++
          if (s.samples.length < MAX_REJECT_SAMPLES) s.samples.push({ reasons: [`account_id: no synced account matches "${row.account_id}"`] })
          continue
        }
        ready.push({ ...row, account_id: accountId })
      }
    }
    // Duplicate keys within a pull: last one wins.
    if (entity === 'telemetry') ready = [...new Map(ready.map((r) => [r.account_id, r])).values()]
    s.written += portfolio[UPSERT[entity]](connection.id, ready)
  }

  if (fullRefresh && s.pulled > 0 && mapping.pruneMissing !== false) {
    s.pruned = portfolio.pruneSince(connection.id, PRUNE_TABLE[entity], entityStart)
    if (s.pruned) write(`${label}: removed ${s.pruned} row(s) no longer in the source`)
  }
  if (maxCursor) connections.setCursor(connection.id, cursorKey, maxCursor)
  write(`${label}: ${s.pulled} pulled · ${s.written} written · ${s.rejected} rejected${resolve ? ` · ${s.unmatched} unmatched account` : ''}`)
  for (const [field, values] of Object.entries(s.unmappedValues)) {
    write(`${label}: ${Object.keys(values).length} unmapped ${field} value(s): ${Object.keys(values).slice(0, 5).join(', ')}`)
  }
  return s
}

// Pull a sample without writing anything — used by the mapping editor.
export async function sampleStream({ db, dataDir, tenantId, connection, stream, limit = 25 }) {
  const connector = getConnector(connection.connector)
  const ctx = buildContext({ db, dataDir, tenantId, connection })
  const records = []
  for await (const batch of connector.read(ctx, stream, { cursor: null, limit })) {
    records.push(...batch.records)
    if (records.length >= limit) break
  }
  return records.slice(0, limit)
}
