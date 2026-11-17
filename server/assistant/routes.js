import { ApiError } from '../lib/router.js'
import { connectionsRepo } from '../repo/connections.js'
import { portfolioRepo } from '../repo/portfolio.js'
import { runAgent } from './agent.js'

// /api/assistant/* — server-side so LLM tokens never reach the browser.
//   Tenant key present  → tools read that tenant's data from the DB.
//   No key (local demo) → tools read the snapshot the browser sends.

const WINDOW_MS = 60_000
const LIMITS = { tenant: 30, anonymous: 10 } // requests per minute
const MAX_SNAPSHOT_ACCOUNTS = 2000

function rateLimiter() {
  const hits = new Map()
  return (key, limit) => {
    const now = Date.now()
    const list = (hits.get(key) ?? []).filter((t) => now - t < WINDOW_MS)
    if (list.length >= limit) throw new ApiError(429, 'Too many assistant requests — try again in a minute')
    list.push(now)
    hits.set(key, list)
  }
}

export function registerAssistantRoutes(router, { llm, docs, tenants, db }) {
  const limit = rateLimiter()

  const optionalTenant = (req) => {
    const header = String(req.headers.authorization ?? '')
    if (!header) return null
    const tenant = tenants.authenticate(header.replace(/^Bearer\s+/i, ''))
    if (!tenant) throw new ApiError(401, 'Invalid tenant API key')
    return tenant
  }

  router.get('/api/assistant/providers', () => llm.describe())

  router.post('/api/assistant/chat', async (req, res) => {
    const tenant = optionalTenant(req)
    limit(tenant ? `t:${tenant.id}` : `ip:${req.raw.socket.remoteAddress}`, tenant ? LIMITS.tenant : LIMITS.anonymous)
    const { messages, provider, model, snapshot, useDataTools = true } = req.body ?? {}
    if (!Array.isArray(messages) || !messages.length) throw new ApiError(400, 'messages is required')
    if (provider && !llm.config.providers?.[provider]) throw new ApiError(400, `Unknown provider "${provider}"`)

    let data = null
    let connections = null
    let workspace = 'Local demo (mock data in the browser)'
    if (tenant) {
      data = portfolioRepo(db, tenant.id).snapshot()
      connections = connectionsRepo(db, tenant.id)
      workspace = `${tenant.name} (tenant workspace with synced CRM data)`
    } else if (snapshot && typeof snapshot === 'object') {
      if ((snapshot.accounts?.length ?? 0) > MAX_SNAPSHOT_ACCOUNTS) throw new ApiError(413, 'Snapshot too large')
      data = snapshot
    }

    // Resolve the provider up front so config errors return JSON, not a broken stream.
    try {
      llm.resolve(provider)
    } catch (e) {
      throw new ApiError(e.status ?? 503, e.message)
    }

    res.writeHead(200, {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-store',
      connection: 'keep-alive',
      'x-accel-buffering': 'no',
    })
    const controller = new AbortController()
    res.on('close', () => controller.abort())
    const emit = (event) => !res.writableEnded && res.write(`data: ${JSON.stringify(event)}\n\n`)

    try {
      for await (const event of runAgent({
        llm,
        provider,
        model,
        messages,
        docsIndex: docs.index,
        snapshot: data ?? { accounts: [], telemetry: [], projects: [], interventions: [], usage: [] },
        connections,
        workspace,
        useDataTools: Boolean(useDataTools) && Boolean(data),
        signal: controller.signal,
      })) {
        emit(event)
      }
    } catch (e) {
      if (!controller.signal.aborted) emit({ type: 'error', message: e.message })
    } finally {
      res.end()
    }
  })

  router.post('/api/assistant/reload-docs', (req) => {
    if (!req.headers.authorization) throw new ApiError(401, 'Tenant API key required')
    optionalTenant(req)
    const index = docs.reload()
    return { pages: index.pages.length, sections: index.chunks.length }
  })
}
