import { HttpError, request } from '../lib/fetch.js'
import { defineConnector, trimSlash } from './define.js'

// HubSpot CRM v3. Records are flattened to { id, ...properties, associations }
// so mappings read `name`, `hs_arr`, `associations.companies[0]` directly.

const OBJECTS = [
  ['companies', 'Companies'],
  ['deals', 'Deals'],
  ['contacts', 'Contacts'],
  ['tickets', 'Tickets'],
  ['line_items', 'Line items'],
]
const MODIFIED = { contacts: 'lastmodifieddate' }
const MAX_PROPERTIES = 200

const base = (ctx) => trimSlash(ctx.config.api_base || 'https://api.hubapi.com')
const hs = async (ctx, path, opts = {}) => {
  try {
    return (await request(`${base(ctx)}${path}`, { ...opts, headers: { authorization: `Bearer ${ctx.secrets.access_token}`, ...opts.headers } })).data
  } catch (e) {
    if (e instanceof HttpError && e.status === 403) throw new HttpError(`HubSpot denied access to ${path} — add the matching crm.objects.*.read scope to the private app.`, e)
    throw e
  }
}

async function propertyNames(ctx, objectType) {
  const configured = String(ctx.config.properties?.[objectType] ?? '').trim()
  if (configured) return configured.split(',').map((s) => s.trim())
  const key = `props:${objectType}`
  if (!ctx.cache.has(key)) {
    const { results } = await hs(ctx, `/crm/v3/properties/${objectType}`)
    // Custom properties first, then HubSpot defaults, capped to keep requests reasonable.
    const sorted = results.filter((p) => !p.hidden || p.name === 'hs_lastmodifieddate').sort((a, b) => Number(Boolean(a.hubspotDefined)) - Number(Boolean(b.hubspotDefined)))
    ctx.cache.set(key, sorted.slice(0, MAX_PROPERTIES).map((p) => p.name))
  }
  return ctx.cache.get(key)
}

async function attachAssociations(ctx, objectType, records) {
  const targets = String(ctx.config.associations ?? 'companies')
    .split(',')
    .map((s) => s.trim())
    .filter((t) => t && t !== objectType)
  for (const target of targets) {
    if (!records.length) break
    try {
      const { results } = await hs(ctx, `/crm/v4/associations/${objectType}/${target}/batch/read`, {
        method: 'POST',
        body: { inputs: records.map((r) => ({ id: r.id })) },
      })
      const byId = new Map(results.map((r) => [String(r.from.id), r.to.map((t) => String(t.toObjectId))]))
      for (const r of records) r.associations[target] = byId.get(r.id) ?? []
    } catch (e) {
      ctx.log(`Associations ${objectType}→${target} unavailable: ${e.message}`)
    }
  }
}

const flatten = (r) => ({ id: String(r.id), ...r.properties, createdAt: r.createdAt, updatedAt: r.updatedAt, archived: r.archived, associations: {} })

export default defineConnector({
  id: 'hubspot',
  name: 'HubSpot',
  vendor: 'HubSpot',
  description: 'HubSpot CRM via a private app token. Companies, deals, contacts, tickets, line items and custom objects.',
  docsUrl: 'https://developers.hubspot.com/docs/api/crm/understanding-the-crm',
  fields: [
    { key: 'access_token', label: 'Private app access token', type: 'password', secret: true, required: true, placeholder: 'pat-na1-…', help: 'Scopes: crm.objects.companies.read, crm.objects.deals.read, crm.schemas.*.read (and any other objects you sync).' },
    { key: 'associations', label: 'Associate records to', type: 'text', default: 'companies', help: 'Comma-separated object types. Exposed as associations.<type>[0] for account references.' },
    { key: 'properties', label: 'Properties per object', type: 'json', default: {}, advanced: true, placeholder: '{ "companies": "name,hs_arr,renewal_date,executive_sponsor" }', help: 'Optional. Defaults to all properties (custom first, capped at 200).' },
    { key: 'api_base', label: 'API base URL', type: 'url', default: 'https://api.hubapi.com', advanced: true },
  ],
  presets: {
    accounts: { stream: 'companies', fields: { id: { source: 'id' }, name: { source: 'name' }, arr_value: { source: 'hs_arr', transforms: ['number'] } } },
    projects: {
      stream: 'tickets',
      accountMatch: 'same_source',
      fields: { id: { source: 'id' }, account_id: { source: 'associations.companies[0]' }, name: { source: 'subject' }, status: { source: 'hs_pipeline_stage' } },
    },
  },

  async test(ctx) {
    await hs(ctx, '/crm/v3/objects/companies', { query: { limit: 1 } })
    return { ok: true, message: 'Connected to HubSpot — companies readable' }
  },

  async listStreams(ctx) {
    const streams = OBJECTS.map(([id, label]) => ({ id, label, incremental: true }))
    try {
      const { results } = await hs(ctx, '/crm/v3/schemas')
      for (const s of results) streams.push({ id: s.objectTypeId, label: `${s.labels?.plural ?? s.name} (custom)`, incremental: true })
    } catch (e) {
      ctx.log(`Custom object schemas unavailable: ${e.message}`)
    }
    return streams
  },

  async *read(ctx, streamId, { cursor, limit }) {
    const properties = await propertyNames(ctx, streamId)
    const modified = MODIFIED[streamId] ?? 'hs_lastmodifieddate'
    if (!properties.includes(modified)) properties.push(modified)
    const pageSize = Math.min(limit ?? 100, 100)
    let after
    let seen = 0
    do {
      let page
      if (cursor) {
        // Incremental: search API filtered on last-modified.
        page = await hs(ctx, `/crm/v3/objects/${streamId}/search`, {
          method: 'POST',
          body: {
            filterGroups: [{ filters: [{ propertyName: modified, operator: 'GTE', value: String(new Date(cursor).getTime()) }] }],
            sorts: [{ propertyName: modified, direction: 'ASCENDING' }],
            properties,
            limit: pageSize,
            after,
          },
        })
      } else {
        page = await hs(ctx, `/crm/v3/objects/${streamId}`, { query: { limit: pageSize, after, archived: 'false', properties: properties.join(',') } })
      }
      const records = (page.results ?? []).map(flatten)
      await attachAssociations(ctx, streamId, records)
      seen += records.length
      const last = records.reduce((m, r) => (r[modified] && r[modified] > m ? r[modified] : m), '')
      yield { records, cursor: last || null }
      after = page.paging?.next?.after
    } while (after && !(limit && seen >= limit))
  },
})
