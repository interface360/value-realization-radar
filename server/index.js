#!/usr/bin/env node
// VRR sync server: multi-tenant connection management + pull-based CRM sync.
//
//   npm run server                    # http://localhost:8787
//   VRR_ADMIN_TOKEN=… npm run server  # fixed admin token
//
// Environment:
//   PORT                        default 8787
//   VRR_DATA_DIR                default ./.vrr-data (SQLite DB, uploads, secret key)
//   VRR_ADMIN_TOKEN             admin token; generated & printed on first start if unset
//   VRR_SECRET_KEY              base64 32-byte key for encrypting credentials
//   VRR_CORS_ORIGINS            comma-separated allowed origins (default: localhost dev ports)
//   VRR_ALLOW_PRIVATE_NETWORK   allow connectors to call private IPs (default true outside production)
//   VRR_SCHEDULER               "off" to disable scheduled pulls

import { randomBytes } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createApp } from './app.js'
import { loadDocs } from './assistant/docs.js'
import { initSecretKey } from './lib/crypto.js'
import { loadEnvFiles } from './lib/env.js'
import { createLlmRegistry } from './llm/registry.js'
import { ApiError, send } from './lib/router.js'
import { recoverStaleRuns } from './repo/connections.js'
import { openDatabase } from './repo/db.js'
import { tenantsRepo } from './repo/tenants.js'
import { startScheduler } from './sync/scheduler.js'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const envFiles = loadEnvFiles(ROOT)

const PORT = Number(process.env.PORT ?? 8787)
const DATA_DIR = resolve(process.env.VRR_DATA_DIR ?? '.vrr-data')
const CORS = (process.env.VRR_CORS_ORIGINS ?? 'http://localhost:5173,http://localhost:5199,http://localhost:4173,http://127.0.0.1:5173')
  .split(',')
  .map((s) => s.trim())

const db = openDatabase(DATA_DIR)
initSecretKey(DATA_DIR)
recoverStaleRuns(db)

function adminToken() {
  if (process.env.VRR_ADMIN_TOKEN) return process.env.VRR_ADMIN_TOKEN
  const file = join(DATA_DIR, 'admin.token')
  if (!existsSync(file)) writeFileSync(file, `vrr_admin_${randomBytes(18).toString('base64url')}`, { mode: 0o600 })
  return readFileSync(file, 'utf8').trim()
}
const ADMIN_TOKEN = adminToken()

// First run: create a demo tenant so the app is usable immediately.
const tenants = tenantsRepo(db)
let bootstrapKey = null
if (!tenants.list().length) {
  const { apiKey } = tenants.create('Demo Workspace')
  bootstrapKey = apiKey
  writeFileSync(join(DATA_DIR, 'demo-tenant.key'), apiKey, { mode: 0o600 })
}

const llm = createLlmRegistry(ROOT)
const docs = loadDocs(ROOT)
const app = createApp({ db, dataDir: DATA_DIR, adminToken: ADMIN_TOKEN, llm, docs })

const server = createServer(async (req, res) => {
  const origin = req.headers.origin
  if (origin && (CORS.includes('*') || CORS.includes(origin))) {
    res.setHeader('access-control-allow-origin', origin)
    res.setHeader('vary', 'origin')
    res.setHeader('access-control-allow-headers', 'authorization, content-type, x-admin-token')
    res.setHeader('access-control-allow-methods', 'GET, POST, PATCH, PUT, DELETE, OPTIONS')
    res.setHeader('access-control-max-age', '600')
  }
  if (req.method === 'OPTIONS') return res.writeHead(204).end()
  const started = Date.now()
  try {
    await app.handle(req, res)
  } catch (e) {
    if (e instanceof ApiError) send(res, e.status, { error: e.message, details: e.details })
    else {
      console.error(e)
      send(res, 500, { error: 'Internal error', message: e.message })
    }
  } finally {
    if (process.env.VRR_LOG_REQUESTS !== 'off' && !req.url.startsWith('/api/health')) {
      console.log(`${req.method} ${req.url.split('?')[0]} → ${res.statusCode} (${Date.now() - started}ms)`)
    }
  }
})

server.listen(PORT, () => {
  console.log(`\n  VRR sync server  http://localhost:${PORT}`)
  console.log(`  data dir         ${DATA_DIR}`)
  console.log(`  admin token      ${process.env.VRR_ADMIN_TOKEN ? '(from VRR_ADMIN_TOKEN)' : `${join(DATA_DIR, 'admin.token')}`}`)
  if (envFiles.length) console.log(`  env files        ${envFiles.join(', ')}`)
  const { providers, defaultProvider } = llm.describe()
  const ready = providers.filter((p) => p.configured)
  console.log(
    `  AI assistant     ${ready.length ? ready.map((p) => `${p.id}${p.id === defaultProvider ? '*' : ''} (${p.model})`).join(', ') : `off: set ${providers.map((p) => p.tokenEnv).filter(Boolean).join(' or ')}`}`,
  )
  console.log(`  docs indexed     ${docs.index.pages.length} pages · ${docs.index.chunks.length} sections`)
  if (bootstrapKey) {
    console.log(`\n  Created tenant "Demo Workspace". API key (also saved to ${join(DATA_DIR, 'demo-tenant.key')}):`)
    console.log(`  ${bootstrapKey}\n`)
  } else {
    console.log(`  tenants          ${tenants.list().length}\n`)
  }
})

const stopScheduler = process.env.VRR_SCHEDULER === 'off' ? () => {} : startScheduler({ db, dataDir: DATA_DIR })

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    stopScheduler()
    server.close(() => {
      db.close()
      process.exit(0)
    })
    setTimeout(() => process.exit(0), 3000).unref()
  })
}
