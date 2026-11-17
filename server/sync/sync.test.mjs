import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, before, test } from 'node:test'
import { getConnector } from '../connectors/index.js'
import { initSecretKey } from '../lib/crypto.js'
import { connectionsRepo } from '../repo/connections.js'
import { openDatabase } from '../repo/db.js'
import { portfolioRepo } from '../repo/portfolio.js'
import { tenantsRepo } from '../repo/tenants.js'
import { runSync } from './engine.js'

let dir
let db
before(() => {
  dir = mkdtempSync(join(tmpdir(), 'vrr-test-'))
  db = openDatabase(dir)
  initSecretKey(dir)
})
after(() => {
  db.close()
  rmSync(dir, { recursive: true, force: true })
})

const demoMapping = () => Object.fromEntries(Object.entries(getConnector('demo').presets).map(([e, p]) => [e, { enabled: true, ...p }]))

test('demo connector syncs every entity and resolves account references', async () => {
  const { tenant } = tenantsRepo(db).create('Alpha')
  const conn = connectionsRepo(db, tenant.id).create({ name: 'Demo', connector: 'demo', config: { seed: 7 }, mapping: demoMapping() })
  const r = await runSync({ db, dataDir: dir, tenantId: tenant.id, connectionId: conn.id })
  assert.equal(r.status, 'success')
  for (const e of ['accounts', 'telemetry', 'usage', 'projects']) assert.ok(r.stats[e].written > 0, `${e} written`)
  assert.equal(r.stats.projects.unmatched, 0)
  const snap = portfolioRepo(db, tenant.id).snapshot()
  assert.equal(snap.accounts.length, 36)
  assert.ok(snap.projects.every((p) => ['On Track', 'Delayed', 'Stalled'].includes(p.status)))
  assert.ok(snap.usage.every((u) => Number.isInteger(u.week)))
})

test('tenants are isolated: data, connections and runs', async () => {
  const t = tenantsRepo(db)
  const a = t.create('Tenant A').tenant
  const b = t.create('Tenant B').tenant
  const conn = connectionsRepo(db, a.id).create({ name: 'Demo', connector: 'demo', mapping: demoMapping() })
  await runSync({ db, dataDir: dir, tenantId: a.id, connectionId: conn.id })

  assert.equal(portfolioRepo(db, b.id).snapshot().accounts.length, 0)
  assert.equal(connectionsRepo(db, b.id).get(conn.id), null)
  assert.deepEqual(connectionsRepo(db, b.id).listRuns(conn.id), [])
  await assert.rejects(runSync({ db, dataDir: dir, tenantId: b.id, connectionId: conn.id }), /not found/)

  // App writes are scoped too.
  const accountId = portfolioRepo(db, a.id).snapshot().accounts[0].id
  portfolioRepo(db, b.id).startIntervention(accountId, 'FDE Deploy')
  assert.equal(portfolioRepo(db, a.id).snapshot().interventions.filter((i) => i.type === 'FDE Deploy' && i.account_id === accountId).length, 0)
})

test('secrets are encrypted at rest and merge on update', () => {
  const { tenant } = tenantsRepo(db).create('Secrets')
  const repo = connectionsRepo(db, tenant.id)
  const c = repo.create({ name: 'SF', connector: 'salesforce', config: { instance_url: 'https://x.my.salesforce.com' }, secrets: { client_secret: 'shh' } })
  const raw = db.prepare('SELECT secrets FROM connections WHERE id = ?').get(c.id).secrets
  assert.ok(!raw.includes('shh'))
  assert.deepEqual(c.secrets_set, ['client_secret'])
  assert.equal(c.secrets, undefined)
  repo.update(c.id, { secrets: { refresh_token: 'r' } })
  assert.deepEqual(repo.get(c.id, { withSecrets: true }).secrets, { client_secret: 'shh', refresh_token: 'r' })
  repo.update(c.id, { secrets: { client_secret: '' } })
  assert.deepEqual(repo.get(c.id).secrets_set, ['refresh_token'])
})

test('API keys authenticate only their tenant; rotation revokes the old key', () => {
  const t = tenantsRepo(db)
  const { tenant, apiKey } = t.create('Keys')
  assert.equal(t.authenticate(apiKey).id, tenant.id)
  assert.equal(t.authenticate(apiKey.slice(0, -2) + 'xx'), null)
  const next = t.rotateKey(tenant.id)
  assert.equal(t.authenticate(apiKey), null)
  assert.equal(t.authenticate(next).id, tenant.id)
})

test('full refresh prunes rows that disappeared from the source', async () => {
  const { tenant } = tenantsRepo(db).create('Prune')
  const repo = connectionsRepo(db, tenant.id)
  const conn = repo.create({ name: 'Demo', connector: 'demo', mapping: { accounts: demoMapping().accounts } })
  await runSync({ db, dataDir: dir, tenantId: tenant.id, connectionId: conn.id })
  // Simulate a stale row from an earlier pull.
  db.prepare("INSERT INTO accounts VALUES (?, ?, ?, 'gone', 'Gone Co', 1, '2027-01-01', NULL, '2000-01-01T00:00:00.000Z')").run(tenant.id, `${conn.id}:gone`, conn.id)
  const r = await runSync({ db, dataDir: dir, tenantId: tenant.id, connectionId: conn.id, mode: 'full' })
  assert.equal(r.stats.accounts.pruned, 1)
  assert.equal(portfolioRepo(db, tenant.id).snapshot().accounts.length, 36)
})

test('rejected rows are reported, not written; run is partial', async () => {
  const { tenant } = tenantsRepo(db).create('Partial')
  const mapping = demoMapping()
  mapping.accounts.fields.arr_value = { source: 'DoesNotExist' }
  const conn = connectionsRepo(db, tenant.id).create({ name: 'Demo', connector: 'demo', mapping: { accounts: mapping.accounts } })
  const r = await runSync({ db, dataDir: dir, tenantId: tenant.id, connectionId: conn.id })
  assert.equal(r.status, 'partial')
  assert.equal(r.stats.accounts.written, 0)
  assert.equal(r.stats.accounts.rejected, 36)
  assert.match(r.stats.accounts.samples[0].reasons[0], /arr_value/)
})
