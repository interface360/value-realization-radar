import { HttpError, request } from '../lib/fetch.js'
import { defineConnector, trimSlash } from './define.js'

// Salesforce REST API (SOQL). Pulls any queryable sObject, plus custom SOQL
// streams for relationship fields (e.g. Account + its executive sponsor contact).

const COMMON_OBJECTS = ['Account', 'Contract', 'Opportunity', 'OpportunityLineItem', 'Asset', 'Contact', 'Case', 'Order', 'Entitlement']
const SKIP_TYPES = new Set(['address', 'location', 'base64', 'complexvalue'])

async function getToken(ctx) {
  if (ctx.cache.has('sf_token')) return ctx.cache.get('sf_token')
  const { config, secrets } = ctx
  let token
  let instance = trimSlash(config.instance_url)
  if (config.auth_type === 'access_token') {
    token = secrets.access_token
  } else {
    const isRefresh = config.auth_type === 'refresh_token'
    const tokenUrl = `${isRefresh ? trimSlash(config.login_url || 'https://login.salesforce.com') : instance}/services/oauth2/token`
    const form = { grant_type: isRefresh ? 'refresh_token' : 'client_credentials', client_id: config.client_id, client_secret: secrets.client_secret }
    if (isRefresh) form.refresh_token = secrets.refresh_token
    const { data } = await request(tokenUrl, { method: 'POST', form, retries: 1 })
    token = data.access_token
    if (data.instance_url) instance = trimSlash(data.instance_url)
    ctx.log(`Authenticated with Salesforce (${form.grant_type})`)
  }
  const auth = { token, instance }
  ctx.cache.set('sf_token', auth)
  return auth
}

async function sf(ctx, pathOrUrl, opts = {}) {
  for (let attempt = 0; ; attempt++) {
    const { token, instance } = await getToken(ctx)
    const url = pathOrUrl.startsWith('http') ? pathOrUrl : `${instance}${pathOrUrl}`
    try {
      return (await request(url, { ...opts, headers: { authorization: `Bearer ${token}`, ...opts.headers } })).data
    } catch (e) {
      // Expired session → re-authenticate once.
      if (e instanceof HttpError && e.status === 401 && attempt === 0 && ctx.config.auth_type !== 'access_token') {
        ctx.cache.delete('sf_token')
        continue
      }
      throw e
    }
  }
}

const apiBase = (ctx) => `/services/data/${ctx.config.api_version || 'v62.0'}`

// SOQL datetime literal: seconds precision, UTC "Z".
const soqlDate = (iso) => new Date(iso).toISOString().replace(/\.\d{3}Z$/, 'Z')

async function describeFields(ctx, object) {
  const key = `describe:${object}`
  if (!ctx.cache.has(key)) {
    const d = await sf(ctx, `${apiBase(ctx)}/sobjects/${encodeURIComponent(object)}/describe`)
    ctx.cache.set(key, d.fields.filter((f) => !SKIP_TYPES.has(f.type)).map((f) => f.name))
  }
  return ctx.cache.get(key)
}

function customQueries(ctx) {
  const q = ctx.config.custom_queries
  return Array.isArray(q) ? q.filter((x) => x?.id && x?.soql) : []
}

export default defineConnector({
  id: 'salesforce',
  name: 'Salesforce',
  vendor: 'Salesforce',
  description: 'Sales Cloud / Service Cloud via the REST API. Any queryable object, including custom objects, plus custom SOQL.',
  docsUrl: 'https://developer.salesforce.com/docs/atlas.en-us.api_rest.meta/api_rest/',
  fields: [
    { key: 'instance_url', label: 'Instance URL', type: 'url', required: true, placeholder: 'https://yourcompany.my.salesforce.com' },
    {
      key: 'auth_type',
      label: 'Authentication',
      type: 'select',
      default: 'client_credentials',
      options: [
        { value: 'client_credentials', label: 'OAuth client credentials (Connected App)' },
        { value: 'refresh_token', label: 'OAuth refresh token' },
        { value: 'access_token', label: 'Access token (short-lived, for testing)' },
      ],
    },
    { key: 'client_id', label: 'Consumer key', type: 'text', required: true, showIf: { key: 'auth_type', in: ['client_credentials', 'refresh_token'] } },
    { key: 'client_secret', label: 'Consumer secret', type: 'password', secret: true, required: true, showIf: { key: 'auth_type', in: ['client_credentials', 'refresh_token'] } },
    { key: 'refresh_token', label: 'Refresh token', type: 'password', secret: true, required: true, showIf: { key: 'auth_type', in: ['refresh_token'] } },
    { key: 'login_url', label: 'Login URL', type: 'url', default: 'https://login.salesforce.com', help: 'Use https://test.salesforce.com for sandboxes.', showIf: { key: 'auth_type', in: ['refresh_token'] }, advanced: true },
    { key: 'access_token', label: 'Access token', type: 'password', secret: true, required: true, showIf: { key: 'auth_type', in: ['access_token'] } },
    { key: 'api_version', label: 'API version', type: 'text', default: 'v62.0', advanced: true },
    {
      key: 'custom_queries',
      label: 'Custom SOQL streams',
      type: 'json',
      default: [],
      advanced: true,
      placeholder: '[{ "id": "AccountsWithSponsor", "soql": "SELECT Id, Name, ARR__c, Renewal_Date__c, Executive_Sponsor__r.Name, SystemModstamp FROM Account WHERE SystemModstamp >= {{since}}", "cursorField": "SystemModstamp" }]',
      help: 'Use for relationship fields. {{since}} is replaced with the last sync time for incremental pulls.',
    },
  ],
  presets: {
    accounts: { stream: 'Account', fields: { id: { source: 'Id' }, name: { source: 'Name' }, arr_value: { source: 'ARR__c', transforms: ['number'] } } },
    projects: { stream: 'Case', accountMatch: 'same_source', fields: { id: { source: 'Id' }, account_id: { source: 'AccountId' }, name: { source: 'Subject' }, status: { source: 'Status' } } },
  },

  async test(ctx) {
    const { instance } = await getToken(ctx)
    const res = await sf(ctx, `${apiBase(ctx)}/sobjects`)
    return { ok: true, message: `Connected to ${new URL(instance).host} · ${res.sobjects.length} objects visible` }
  },

  async listStreams(ctx) {
    const res = await sf(ctx, `${apiBase(ctx)}/sobjects`)
    const objects = res.sobjects
      .filter((o) => o.queryable && (o.custom ? !o.name.endsWith('__Share') && !o.name.endsWith('__History') && !o.name.endsWith('__Feed') : COMMON_OBJECTS.includes(o.name)))
      .sort((a, b) => Number(b.custom) - Number(a.custom) || a.label.localeCompare(b.label))
      .map((o) => ({ id: o.name, label: `${o.label} (${o.name})`, description: o.custom ? 'Custom object' : 'Standard object', incremental: true }))
    const custom = customQueries(ctx).map((q) => ({ id: `soql:${q.id}`, label: `${q.id} (custom SOQL)`, description: q.soql.slice(0, 120), incremental: Boolean(q.cursorField) }))
    return [...custom, ...objects]
  },

  async *read(ctx, streamId, { cursor, limit }) {
    let soql
    let cursorField = 'SystemModstamp'
    if (streamId.startsWith('soql:')) {
      const q = customQueries(ctx).find((x) => `soql:${x.id}` === streamId)
      if (!q) throw new Error(`Custom query ${streamId} not found`)
      cursorField = q.cursorField ?? null
      soql = q.soql.replaceAll('{{since}}', soqlDate(cursor ?? '1970-01-01T00:00:00Z'))
    } else {
      if (!/^[A-Za-z0-9_]+$/.test(streamId)) throw new Error(`Invalid object name ${streamId}`)
      const fields = await describeFields(ctx, streamId)
      const where = cursor && fields.includes('SystemModstamp') ? ` WHERE SystemModstamp >= ${soqlDate(cursor)}` : ''
      const order = fields.includes('SystemModstamp') ? ' ORDER BY SystemModstamp ASC' : ''
      soql = `SELECT ${fields.join(', ')} FROM ${streamId}${where}${order}${limit ? ` LIMIT ${limit}` : ''}`
      if (!fields.includes('SystemModstamp')) cursorField = null
    }

    let page = await sf(ctx, `${apiBase(ctx)}/query`, { query: { q: soql } })
    ctx.log(`${streamId}: ${page.totalSize} record(s) match`)
    let seen = 0
    while (true) {
      const records = page.records ?? []
      seen += records.length
      const last = cursorField ? records.at(-1)?.[cursorField] : null
      yield { records, cursor: last ? new Date(String(last).replace(/\+0000$/, 'Z')).toISOString() : null }
      if (page.done || !page.nextRecordsUrl || (limit && seen >= limit)) break
      page = await sf(ctx, page.nextRecordsUrl)
    }
  },
})
