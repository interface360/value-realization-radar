import { getPath } from '../../shared/mapping/paths.js'
import { parseLinkHeader, request } from '../lib/fetch.js'
import { defineConnector, trimSlash } from './define.js'

// Generic REST/JSON connector — the "any CRM" adapter. Configure auth,
// endpoints, where records live in the response and how to paginate.
// Templates prefill it for common CRMs (Dynamics 365, Zoho, Pipedrive, …).

const tpl = (s, vars) => String(s ?? '').replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? '')

function streamsOf(config) {
  return (Array.isArray(config.streams) ? config.streams : []).filter((s) => s?.id && s?.path)
}

async function authHeaders(ctx) {
  const { config, secrets } = ctx
  const headers = { ...(config.headers ?? {}) }
  switch (config.auth_type) {
    case 'bearer':
      headers.authorization = `Bearer ${secrets.token}`
      break
    case 'basic':
      headers.authorization = `Basic ${Buffer.from(`${config.username ?? ''}:${secrets.password ?? ''}`).toString('base64')}`
      break
    case 'api_key_header':
      headers[config.api_key_name || 'x-api-key'] = `${config.api_key_prefix ?? ''}${secrets.api_key}`
      break
    case 'oauth_client_credentials': {
      if (!ctx.cache.has('rest_token')) {
        const form = { grant_type: 'client_credentials', client_id: config.client_id, client_secret: secrets.client_secret }
        if (config.scope) form.scope = config.scope
        const { data } = await request(config.token_url, { method: 'POST', form, retries: 1 })
        ctx.cache.set('rest_token', data.access_token)
        ctx.log('Obtained OAuth token (client credentials)')
      }
      headers.authorization = `Bearer ${ctx.cache.get('rest_token')}`
      break
    }
    default:
      break
  }
  return headers
}

function queryAuth(ctx) {
  return ctx.config.auth_type === 'api_key_query' ? { [ctx.config.api_key_name || 'api_key']: ctx.secrets.api_key } : {}
}

function extractRecords(data, recordsPath) {
  const value = recordsPath ? getPath(data, recordsPath) : data
  if (Array.isArray(value)) return value
  if (value && typeof value === 'object') return [value]
  return []
}

export default defineConnector({
  id: 'rest',
  name: 'Any CRM (REST/JSON)',
  vendor: 'Generic',
  category: 'generic',
  description: 'Point at any REST API that returns JSON: Dynamics 365, Zoho, Pipedrive, Freshsales, Gainsight, your warehouse API… Configure auth, endpoints and pagination.',
  fields: [
    { key: 'base_url', label: 'Base URL', type: 'url', required: true, placeholder: 'https://api.example.com/v1' },
    {
      key: 'auth_type',
      label: 'Authentication',
      type: 'select',
      default: 'bearer',
      options: [
        { value: 'none', label: 'None' },
        { value: 'bearer', label: 'Bearer token' },
        { value: 'basic', label: 'Basic auth' },
        { value: 'api_key_header', label: 'API key in header' },
        { value: 'api_key_query', label: 'API key in query string' },
        { value: 'oauth_client_credentials', label: 'OAuth 2.0 client credentials' },
      ],
    },
    { key: 'token', label: 'Token', type: 'password', secret: true, required: true, showIf: { key: 'auth_type', in: ['bearer'] } },
    { key: 'username', label: 'Username', type: 'text', showIf: { key: 'auth_type', in: ['basic'] } },
    { key: 'password', label: 'Password', type: 'password', secret: true, showIf: { key: 'auth_type', in: ['basic'] } },
    { key: 'api_key', label: 'API key', type: 'password', secret: true, required: true, showIf: { key: 'auth_type', in: ['api_key_header', 'api_key_query'] } },
    { key: 'api_key_name', label: 'Header / parameter name', type: 'text', default: 'x-api-key', showIf: { key: 'auth_type', in: ['api_key_header', 'api_key_query'] } },
    { key: 'api_key_prefix', label: 'Value prefix', type: 'text', placeholder: 'Zoho-oauthtoken ', showIf: { key: 'auth_type', in: ['api_key_header'] }, advanced: true },
    { key: 'token_url', label: 'Token URL', type: 'url', required: true, showIf: { key: 'auth_type', in: ['oauth_client_credentials'] } },
    { key: 'client_id', label: 'Client ID', type: 'text', required: true, showIf: { key: 'auth_type', in: ['oauth_client_credentials'] } },
    { key: 'client_secret', label: 'Client secret', type: 'password', secret: true, required: true, showIf: { key: 'auth_type', in: ['oauth_client_credentials'] } },
    { key: 'scope', label: 'Scope', type: 'text', showIf: { key: 'auth_type', in: ['oauth_client_credentials'] } },
    {
      key: 'streams',
      label: 'Endpoints (streams)',
      type: 'json',
      required: true,
      default: [{ id: 'accounts', path: '/accounts', recordsPath: 'data' }],
      help: 'Each: { id, path, recordsPath?, query?, label? }. path is relative to the base URL. {{since}} in query values is replaced with the last cursor.',
    },
    {
      key: 'pagination',
      label: 'Pagination',
      type: 'select',
      default: 'none',
      options: [
        { value: 'none', label: 'None (single request)' },
        { value: 'page', label: 'Page number (?page=1,2,3…)' },
        { value: 'offset', label: 'Offset / limit' },
        { value: 'cursor', label: 'Cursor token in response body' },
        { value: 'next_url', label: 'Next-page URL in response body' },
        { value: 'link_header', label: 'Link header (rel="next")' },
      ],
    },
    { key: 'page_param', label: 'Page / offset parameter', type: 'text', default: 'page', showIf: { key: 'pagination', in: ['page', 'offset'] } },
    { key: 'page_start', label: 'First page number', type: 'number', default: 1, showIf: { key: 'pagination', in: ['page'] }, advanced: true },
    { key: 'limit_param', label: 'Page size parameter', type: 'text', default: 'limit', showIf: { key: 'pagination', in: ['page', 'offset', 'cursor'] } },
    { key: 'page_size', label: 'Page size', type: 'number', default: 100, showIf: { key: 'pagination', in: ['page', 'offset', 'cursor'] } },
    { key: 'cursor_path', label: 'Next cursor path in response', type: 'text', placeholder: 'meta.next_cursor', showIf: { key: 'pagination', in: ['cursor'] } },
    { key: 'cursor_param', label: 'Cursor request parameter', type: 'text', default: 'cursor', showIf: { key: 'pagination', in: ['cursor'] } },
    { key: 'next_url_path', label: 'Next URL path in response', type: 'text', placeholder: '["@odata.nextLink"]', showIf: { key: 'pagination', in: ['next_url'] } },
    { key: 'incremental_field', label: 'Updated-at field (for incremental)', type: 'text', placeholder: 'updated_at', advanced: true, help: 'The max value seen becomes {{since}} on the next run.' },
    { key: 'headers', label: 'Extra headers', type: 'json', default: {}, advanced: true, placeholder: '{ "Accept": "application/json" }' },
    { key: 'max_pages', label: 'Safety limit (pages per stream)', type: 'number', default: 500, advanced: true },
  ],
  templates: [
    {
      id: 'dynamics365',
      label: 'Microsoft Dynamics 365',
      description: 'Dataverse Web API with Entra ID client credentials.',
      config: {
        base_url: 'https://YOURORG.api.crm.dynamics.com/api/data/v9.2',
        auth_type: 'oauth_client_credentials',
        token_url: 'https://login.microsoftonline.com/YOUR_TENANT_ID/oauth2/v2.0/token',
        scope: 'https://YOURORG.api.crm.dynamics.com/.default',
        pagination: 'next_url',
        next_url_path: '["@odata.nextLink"]',
        incremental_field: 'modifiedon',
        headers: { 'OData-MaxVersion': '4.0', 'OData-Version': '4.0', Prefer: 'odata.maxpagesize=500' },
        streams: [
          { id: 'accounts', path: '/accounts', recordsPath: 'value', query: { $filter: 'modifiedon ge {{since}}' } },
          { id: 'opportunities', path: '/opportunities', recordsPath: 'value' },
          { id: 'contracts', path: '/contracts', recordsPath: 'value' },
        ],
      },
    },
    {
      id: 'zoho',
      label: 'Zoho CRM',
      description: 'Zoho CRM v6 REST with an OAuth access token.',
      config: {
        base_url: 'https://www.zohoapis.com/crm/v6',
        auth_type: 'api_key_header',
        api_key_name: 'Authorization',
        api_key_prefix: 'Zoho-oauthtoken ',
        pagination: 'page',
        page_param: 'page',
        limit_param: 'per_page',
        page_size: 200,
        incremental_field: 'Modified_Time',
        streams: [
          { id: 'Accounts', path: '/Accounts', recordsPath: 'data', query: { fields: 'Account_Name,Annual_Revenue,Owner,Modified_Time' } },
          { id: 'Deals', path: '/Deals', recordsPath: 'data', query: { fields: 'Deal_Name,Amount,Closing_Date,Account_Name,Stage' } },
        ],
      },
    },
    {
      id: 'pipedrive',
      label: 'Pipedrive',
      description: 'Pipedrive API v1 with an API token.',
      config: {
        base_url: 'https://api.pipedrive.com/v1',
        auth_type: 'api_key_query',
        api_key_name: 'api_token',
        pagination: 'offset',
        page_param: 'start',
        limit_param: 'limit',
        page_size: 500,
        streams: [
          { id: 'organizations', path: '/organizations', recordsPath: 'data' },
          { id: 'deals', path: '/deals', recordsPath: 'data' },
        ],
      },
    },
    {
      id: 'freshsales',
      label: 'Freshsales (Freshworks CRM)',
      description: 'Freshsales API with a token header.',
      config: {
        base_url: 'https://YOURDOMAIN.myfreshworks.com/crm/sales/api',
        auth_type: 'api_key_header',
        api_key_name: 'Authorization',
        api_key_prefix: 'Token token=',
        pagination: 'page',
        page_param: 'page',
        limit_param: 'per_page',
        page_size: 100,
        streams: [{ id: 'sales_accounts', path: '/sales_accounts/view/1', recordsPath: 'sales_accounts' }],
      },
    },
  ],

  async test(ctx) {
    const [first] = streamsOf(ctx.config)
    if (!first) return { ok: false, message: 'Add at least one endpoint under "Endpoints (streams)"' }
    let count = 0
    for await (const batch of this.read(ctx, first.id, { cursor: null, limit: 1 })) {
      count += batch.records.length
      break
    }
    return { ok: true, message: `Reached ${new URL(ctx.config.base_url).host}${first.path} · ${count ? 'records found' : 'no records returned (check recordsPath)'}` }
  },

  async listStreams(ctx) {
    return streamsOf(ctx.config).map((s) => ({ id: s.id, label: s.label ?? `${s.id} (${s.path})`, incremental: Boolean(ctx.config.incremental_field) }))
  },

  async *read(ctx, streamId, { cursor, limit }) {
    const { config } = ctx
    const stream = streamsOf(config).find((s) => s.id === streamId)
    if (!stream) throw new Error(`Endpoint "${streamId}" is not configured`)
    const vars = { since: cursor ?? '1970-01-01T00:00:00Z' }
    const baseQuery = Object.fromEntries(
      Object.entries(stream.query ?? {})
        .filter(([, v]) => cursor || !String(v).includes('{{since}}'))
        .map(([k, v]) => [k, tpl(v, vars)]),
    )
    const pageSize = limit ? Math.min(limit, config.page_size || 100) : config.page_size || 100
    let url = /^https?:/.test(stream.path) ? stream.path : `${trimSlash(config.base_url)}/${stream.path.replace(/^\//, '')}`
    let page = Number(config.page_start ?? 1)
    let offset = 0
    let token = null
    let seen = 0
    const maxPages = config.max_pages || 500

    for (let n = 0; n < maxPages; n++) {
      const query = { ...queryAuth(ctx) }
      if (n === 0 || !['next_url', 'link_header'].includes(config.pagination)) Object.assign(query, baseQuery)
      if (config.pagination === 'page') Object.assign(query, { [config.page_param || 'page']: page, [config.limit_param || 'limit']: pageSize })
      if (config.pagination === 'offset') Object.assign(query, { [config.page_param || 'offset']: offset, [config.limit_param || 'limit']: pageSize })
      if (config.pagination === 'cursor') {
        query[config.limit_param || 'limit'] = pageSize
        if (token) query[config.cursor_param || 'cursor'] = token
      }

      const { data, headers } = await request(url, { headers: await authHeaders(ctx), query })
      const records = extractRecords(data, stream.recordsPath)
      seen += records.length
      const field = config.incremental_field
      const maxSeen = field ? records.reduce((m, r) => (getPath(r, field) && String(getPath(r, field)) > m ? String(getPath(r, field)) : m), '') : ''
      yield { records, cursor: maxSeen || null }

      if (!records.length || (limit && seen >= limit)) break
      if (config.pagination === 'page') {
        if (records.length < pageSize) break
        page++
      } else if (config.pagination === 'offset') {
        if (records.length < pageSize) break
        offset += records.length
      } else if (config.pagination === 'cursor') {
        token = getPath(data, config.cursor_path)
        if (!token) break
      } else if (config.pagination === 'next_url') {
        const next = getPath(data, config.next_url_path)
        if (!next) break
        url = new URL(next, url).toString()
      } else if (config.pagination === 'link_header') {
        const next = parseLinkHeader(headers.get('link')).next
        if (!next) break
        url = next
      } else break
    }
  },
})
