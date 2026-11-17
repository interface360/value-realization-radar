import { HttpError, request } from '../lib/fetch.js'
import { defineConnector, trimSlash } from './define.js'

// ServiceNow Table API. Works for CSM (customer_account, contracts,
// entitlements, cases), SPM (pm_project) and any custom u_ table.

const TABLES = [
  ['customer_account', 'Customer accounts (CSM)'],
  ['core_company', 'Companies'],
  ['ast_contract', 'Contracts'],
  ['service_entitlement', 'Entitlements'],
  ['sn_customerservice_case', 'Customer service cases'],
  ['pm_project', 'Projects (SPM)'],
  ['pm_project_task', 'Project tasks (SPM)'],
  ['customer_contact', 'Customer contacts'],
]
const PAGE = 1000

async function authHeaders(ctx) {
  const { config, secrets } = ctx
  if (config.auth_type === 'basic') return { authorization: `Basic ${Buffer.from(`${config.username}:${secrets.password}`).toString('base64')}` }
  if (config.auth_type === 'bearer') return { authorization: `Bearer ${secrets.token}` }
  if (!ctx.cache.has('sn_token')) {
    const { data } = await request(`${trimSlash(config.instance_url)}/oauth_token.do`, {
      method: 'POST',
      retries: 1,
      form: { grant_type: 'password', client_id: config.client_id, client_secret: secrets.client_secret, username: config.username, password: secrets.password },
    })
    ctx.cache.set('sn_token', data.access_token)
    ctx.log('Authenticated with ServiceNow (OAuth password grant)')
  }
  return { authorization: `Bearer ${ctx.cache.get('sn_token')}` }
}

async function table(ctx, name, query) {
  if (!/^[a-z0-9_]+$/i.test(name)) throw new Error(`Invalid table name ${name}`)
  try {
    const res = await request(`${trimSlash(ctx.config.instance_url)}/api/now/table/${name}`, { headers: await authHeaders(ctx), query })
    return res.data.result ?? []
  } catch (e) {
    if (e instanceof HttpError && e.status === 403) throw new HttpError(`No read access to table ${name} (ACL). Grant the integration user read on it.`, e)
    if (e instanceof HttpError && e.status === 400 && /Invalid table/i.test(e.message)) throw new HttpError(`Table ${name} does not exist on this instance`, e)
    throw e
  }
}

// "2026-01-31 14:00:00" → gs.dateGenerate filter (instance-timezone safe)
function sinceFilter(cursor) {
  const [date, time] = cursor.split(' ')
  return `sys_updated_on>=javascript:gs.dateGenerate('${date}','${time ?? '00:00:00'}')`
}

export default defineConnector({
  id: 'servicenow',
  name: 'ServiceNow',
  vendor: 'ServiceNow',
  description: 'CSM / SPM via the Table API. Customer accounts, contracts, entitlements, cases, projects or any custom table.',
  docsUrl: 'https://developer.servicenow.com/dev.do#!/reference/api/latest/rest/c_TableAPI',
  fields: [
    { key: 'instance_url', label: 'Instance URL', type: 'url', required: true, placeholder: 'https://yourcompany.service-now.com' },
    {
      key: 'auth_type',
      label: 'Authentication',
      type: 'select',
      default: 'basic',
      options: [
        { value: 'basic', label: 'Basic (integration user)' },
        { value: 'oauth_password', label: 'OAuth (password grant)' },
        { value: 'bearer', label: 'Bearer token' },
      ],
    },
    { key: 'username', label: 'Username', type: 'text', required: true, showIf: { key: 'auth_type', in: ['basic', 'oauth_password'] } },
    { key: 'password', label: 'Password', type: 'password', secret: true, required: true, showIf: { key: 'auth_type', in: ['basic', 'oauth_password'] } },
    { key: 'client_id', label: 'OAuth client ID', type: 'text', required: true, showIf: { key: 'auth_type', in: ['oauth_password'] } },
    { key: 'client_secret', label: 'OAuth client secret', type: 'password', secret: true, required: true, showIf: { key: 'auth_type', in: ['oauth_password'] } },
    { key: 'token', label: 'Bearer token', type: 'password', secret: true, required: true, showIf: { key: 'auth_type', in: ['bearer'] } },
    { key: 'extra_tables', label: 'Additional tables', type: 'text', placeholder: 'u_adoption_metrics, u_customer_health', help: 'Comma-separated table names to offer as streams.' },
    {
      key: 'display_value',
      label: 'Reference fields',
      type: 'select',
      default: 'false',
      advanced: true,
      options: [
        { value: 'false', label: 'Raw values / sys_ids (recommended, enables incremental)' },
        { value: 'true', label: 'Display values' },
        { value: 'all', label: 'Both ({ value, display_value })' },
      ],
    },
  ],
  presets: {
    accounts: { stream: 'customer_account', fields: { id: { source: 'sys_id' }, name: { source: 'name' } } },
    projects: {
      stream: 'pm_project',
      accountMatch: 'any_source',
      fields: { id: { source: 'sys_id' }, name: { source: 'short_description' }, status: { source: 'status', valueMap: { green: 'On Track', yellow: 'Delayed', red: 'Stalled' } } },
    },
  },

  async test(ctx) {
    const rows = await table(ctx, 'sys_user', { sysparm_limit: 1, sysparm_fields: 'sys_id' }).catch(() => table(ctx, 'customer_account', { sysparm_limit: 1 }))
    return { ok: true, message: `Connected to ${new URL(ctx.config.instance_url).host}${rows ? '' : ''}` }
  },

  async listStreams(ctx) {
    const extra = String(ctx.config.extra_tables ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .map((t) => [t, 'Custom table'])
    const incremental = (ctx.config.display_value ?? 'false') === 'false'
    return [...extra, ...TABLES].map(([id, label]) => ({ id, label: `${label} (${id})`, incremental }))
  },

  async *read(ctx, streamId, { cursor, limit }) {
    const incremental = (ctx.config.display_value ?? 'false') === 'false'
    const parts = []
    if (cursor && incremental) parts.push(sinceFilter(cursor))
    parts.push('ORDERBYsys_updated_on')
    const pageSize = limit ? Math.min(limit, PAGE) : PAGE
    let offset = 0
    while (true) {
      const records = await table(ctx, streamId, {
        sysparm_query: parts.join('^'),
        sysparm_limit: pageSize,
        sysparm_offset: offset,
        sysparm_display_value: ctx.config.display_value ?? 'false',
        sysparm_exclude_reference_link: 'true',
      })
      const last = records.at(-1)?.sys_updated_on
      yield { records, cursor: incremental && typeof last === 'string' ? last : null }
      offset += records.length
      if (records.length < pageSize || (limit && offset >= limit)) break
    }
  },
})
