// Connector protocol tests against local mock servers that mimic each vendor's
// API shape (auth, pagination, incremental filters). No network access needed.
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { after, before, test } from 'node:test'
import hubspot from './hubspot.js'
import rest from './rest.js'
import salesforce from './salesforce.js'
import servicenow from './servicenow.js'

let server
let base
const calls = []
const routes = new Map()

before(async () => {
  server = createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x')
    let body = ''
    for await (const c of req) body += c
    calls.push({ method: req.method, path: url.pathname, query: Object.fromEntries(url.searchParams), headers: req.headers, body })
    const handler = routes.get(`${req.method} ${url.pathname}`)
    if (!handler) return res.writeHead(404).end('{"error":"no route"}')
    const out = await handler({ url, body: body ? (req.headers['content-type']?.includes('json') ? JSON.parse(body) : Object.fromEntries(new URLSearchParams(body))) : null, headers: req.headers })
    res.writeHead(out.status ?? 200, { 'content-type': 'application/json', ...(out.headers ?? {}) }).end(JSON.stringify(out.json ?? {}))
  })
  await new Promise((r) => server.listen(0, r))
  base = `http://127.0.0.1:${server.address().port}`
})
after(() => server.close())

const ctx = (config, secrets = {}) => ({ config, secrets, cache: new Map(), log: () => {}, tenantId: 't', connectionId: 'c', dataDir: '/tmp', updateSecrets: () => {} })
async function readAll(connector, c, stream, opts = {}) {
  const records = []
  let cursor = null
  for await (const b of connector.read(c, stream, { cursor: null, ...opts })) {
    records.push(...b.records)
    if (b.cursor) cursor = b.cursor
  }
  return { records, cursor }
}

test('Salesforce: client-credentials auth, describe → SOQL, nextRecordsUrl paging, incremental WHERE', async () => {
  routes.set('POST /services/oauth2/token', ({ body }) => {
    assert.equal(body.grant_type, 'client_credentials')
    return { json: { access_token: 'tok', instance_url: base } }
  })
  routes.set('GET /services/data/v62.0/sobjects/Account/describe', () => ({ json: { fields: [{ name: 'Id', type: 'id' }, { name: 'Name', type: 'string' }, { name: 'BillingAddress', type: 'address' }, { name: 'SystemModstamp', type: 'datetime' }] } }))
  routes.set('GET /services/data/v62.0/query', ({ url, headers }) => {
    assert.equal(headers.authorization, 'Bearer tok')
    const q = url.searchParams.get('q')
    assert.ok(!q.includes('BillingAddress'), 'compound fields excluded')
    return { json: { totalSize: 3, done: false, nextRecordsUrl: '/services/data/v62.0/query/01g-2000', records: [{ Id: '1', SystemModstamp: '2026-01-01T00:00:00.000+0000' }, { Id: '2', SystemModstamp: '2026-01-02T00:00:00.000+0000' }] } }
  })
  routes.set('GET /services/data/v62.0/query/01g-2000', () => ({ json: { done: true, records: [{ Id: '3', SystemModstamp: '2026-01-03T00:00:00.000+0000' }] } }))

  const c = ctx({ instance_url: base, auth_type: 'client_credentials', client_id: 'id' }, { client_secret: 's' })
  const { records, cursor } = await readAll(salesforce, c, 'Account')
  assert.deepEqual(records.map((r) => r.Id), ['1', '2', '3'])
  assert.equal(cursor, '2026-01-03T00:00:00.000Z')

  calls.length = 0
  await readAll(salesforce, c, 'Account', { cursor: '2026-01-02T00:00:00.000Z' })
  const q = calls.find((x) => x.path.endsWith('/query')).query.q
  assert.match(q, /WHERE SystemModstamp >= 2026-01-02T00:00:00Z ORDER BY SystemModstamp ASC/)
})

test('ServiceNow: basic auth, offset paging, sys_updated_on incremental filter', async () => {
  const rows = Array.from({ length: 5 }, (_, i) => ({ sys_id: `s${i}`, name: `Acct ${i}`, sys_updated_on: `2026-02-0${i + 1} 10:00:00` }))
  routes.set('GET /api/now/table/customer_account', ({ url, headers }) => {
    assert.equal(headers.authorization, `Basic ${Buffer.from('u:p').toString('base64')}`)
    const off = Number(url.searchParams.get('sysparm_offset'))
    const lim = Number(url.searchParams.get('sysparm_limit'))
    return { json: { result: rows.slice(off, off + lim) } }
  })
  const c = ctx({ instance_url: base, auth_type: 'basic', username: 'u' }, { password: 'p' })
  // Force small pages via limit to exercise paging.
  const { records, cursor } = await readAll(servicenow, c, 'customer_account')
  assert.equal(records.length, 5)
  assert.equal(cursor, '2026-02-05 10:00:00')

  calls.length = 0
  await readAll(servicenow, c, 'customer_account', { cursor: '2026-02-03 10:00:00' })
  assert.match(calls[0].query.sysparm_query, /^sys_updated_on>=javascript:gs\.dateGenerate\('2026-02-03','10:00:00'\)\^ORDERBYsys_updated_on$/)
})

test('HubSpot: list paging via paging.next.after, flattening, associations, search for incremental', async () => {
  routes.set('GET /crm/v3/properties/companies', () => ({ json: { results: [{ name: 'name' }, { name: 'hs_arr' }, { name: 'renewal_date', hubspotDefined: false }] } }))
  routes.set('GET /crm/v3/objects/companies', ({ url }) => {
    const after = url.searchParams.get('after')
    assert.ok(url.searchParams.get('properties').includes('hs_lastmodifieddate'))
    return after
      ? { json: { results: [{ id: '3', properties: { name: 'C', hs_lastmodifieddate: '2026-03-03T00:00:00Z' } }] } }
      : { json: { results: [{ id: '1', properties: { name: 'A', hs_arr: '100', hs_lastmodifieddate: '2026-03-01T00:00:00Z' } }, { id: '2', properties: { name: 'B' } }], paging: { next: { after: '2' } } } }
  })
  routes.set('POST /crm/v4/associations/companies/deals/batch/read', ({ body }) => ({ json: { results: body.inputs.map((i) => ({ from: { id: i.id }, to: [{ toObjectId: Number(i.id) * 10 }] })) } }))
  routes.set('POST /crm/v3/objects/companies/search', ({ body }) => {
    assert.equal(body.filterGroups[0].filters[0].operator, 'GTE')
    assert.equal(body.filterGroups[0].filters[0].value, String(Date.parse('2026-03-02T00:00:00Z')))
    return { json: { results: [{ id: '3', properties: { name: 'C', hs_lastmodifieddate: '2026-03-03T00:00:00Z' } }] } }
  })

  const c = ctx({ api_base: base, associations: 'deals' }, { access_token: 'pat' })
  const { records, cursor } = await readAll(hubspot, c, 'companies')
  assert.deepEqual(records.map((r) => r.name), ['A', 'B', 'C'])
  assert.equal(records[0].hs_arr, '100')
  assert.deepEqual(records[0].associations.deals, ['10'])
  assert.equal(cursor, '2026-03-03T00:00:00Z')

  const inc = await readAll(hubspot, c, 'companies', { cursor: '2026-03-02T00:00:00Z' })
  assert.deepEqual(inc.records.map((r) => r.id), ['3'])
})

test('REST: OAuth client credentials, recordsPath, page / cursor / next_url / link_header pagination, {{since}}', async () => {
  routes.set('POST /oauth/token', ({ body }) => (assert.equal(body.grant_type, 'client_credentials'), { json: { access_token: 'cc' } }))
  routes.set('GET /v1/page', ({ url, headers }) => {
    assert.equal(headers.authorization, 'Bearer cc')
    const p = Number(url.searchParams.get('page'))
    return { json: { data: p <= 2 ? [{ id: `${p}a`, updated_at: `2026-0${p}-01` }, { id: `${p}b` }] : [] } }
  })
  const base1 = { base_url: `${base}/v1`, auth_type: 'oauth_client_credentials', token_url: `${base}/oauth/token`, client_id: 'x', incremental_field: 'updated_at' }
  const page = await readAll(rest, ctx({ ...base1, pagination: 'page', page_param: 'page', page_size: 2, page_start: 1, streams: [{ id: 's', path: '/page', recordsPath: 'data', query: { since: '{{since}}' } }] }, { client_secret: 'y' }), 's')
  assert.equal(page.records.length, 4)
  assert.equal(page.cursor, '2026-02-01')
  assert.ok(!calls.filter((c) => c.path === '/v1/page').some((c) => 'since' in c.query), '{{since}} params dropped on first full pull')

  routes.set('GET /v1/cur', ({ url }) => ({ json: url.searchParams.get('cursor') ? { items: [{ id: 3 }], meta: {} } : { items: [{ id: 1 }, { id: 2 }], meta: { next: 'abc' } } }))
  const cur = await readAll(rest, ctx({ base_url: `${base}/v1`, auth_type: 'none', pagination: 'cursor', cursor_path: 'meta.next', cursor_param: 'cursor', streams: [{ id: 's', path: '/cur', recordsPath: 'items' }] }), 's')
  assert.deepEqual(cur.records.map((r) => r.id), [1, 2, 3])

  routes.set('GET /v1/odata', ({ url }) => ({ json: url.searchParams.get('$skiptoken') ? { value: [{ id: 'b' }] } : { value: [{ id: 'a' }], '@odata.nextLink': `${base}/v1/odata?$skiptoken=2` } }))
  const od = await readAll(rest, ctx({ base_url: `${base}/v1`, auth_type: 'none', pagination: 'next_url', next_url_path: '["@odata.nextLink"]', streams: [{ id: 's', path: '/odata', recordsPath: 'value' }] }), 's')
  assert.deepEqual(od.records.map((r) => r.id), ['a', 'b'])

  routes.set('GET /v1/link', ({ url }) => (url.searchParams.get('p') ? { json: [{ id: 2 }] } : { json: [{ id: 1 }], headers: { link: `<${base}/v1/link?p=2>; rel="next"` } }))
  const lh = await readAll(rest, ctx({ base_url: `${base}/v1`, auth_type: 'api_key_header', api_key_name: 'x-api-key', pagination: 'link_header', streams: [{ id: 's', path: '/link' }] }, { api_key: 'k' }), 's')
  assert.deepEqual(lh.records.map((r) => r.id), [1, 2])
  assert.equal(calls.findLast((c) => c.path === '/v1/link').headers['x-api-key'], 'k')
})

test('HTTP errors surface vendor messages', async () => {
  routes.set('GET /api/now/table/locked', () => ({ status: 403, json: { error: { message: 'User Not Authorized' } } }))
  await assert.rejects(readAll(servicenow, ctx({ instance_url: base, auth_type: 'basic', username: 'u' }, { password: 'p' }), 'locked'), /No read access to table locked/)
})
