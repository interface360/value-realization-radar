/**
 * Connector contract. A connector knows how to authenticate against one kind of
 * source and pull raw records out of it. It knows nothing about VRR's model —
 * the mapping layer turns raw records into accounts/telemetry/usage/projects.
 *
 * @typedef {object} ConnectorField
 * @property {string} key
 * @property {string} label
 * @property {'text'|'url'|'password'|'number'|'select'|'textarea'|'json'|'boolean'} type
 * @property {boolean} [secret]     stored encrypted, never returned to the browser
 * @property {boolean} [required]
 * @property {any} [default]
 * @property {string} [placeholder]
 * @property {string} [help]
 * @property {{value:string,label:string}[]} [options]
 * @property {{ key: string, in: any[] }} [showIf]  only relevant when another field has one of these values
 * @property {boolean} [advanced]
 *
 * @typedef {object} Stream
 * @property {string} id
 * @property {string} label
 * @property {string} [description]
 * @property {boolean} [incremental]  supports cursor-based incremental pulls
 *
 * @typedef {object} ConnectorContext
 * @property {Record<string, any>} config
 * @property {Record<string, any>} secrets
 * @property {string} tenantId
 * @property {string} connectionId
 * @property {string} dataDir
 * @property {(msg: string) => void} log
 * @property {(patch: object) => void} updateSecrets   persist refreshed tokens
 * @property {Map<string, any>} cache                  per-run scratch space
 *
 * @typedef {object} Connector
 * @property {string} id
 * @property {string} name
 * @property {string} vendor
 * @property {string} description
 * @property {string} [docsUrl]
 * @property {ConnectorField[]} fields
 * @property {{ id: string, label: string, description?: string, config: object }[]} [templates]  config prefills
 * @property {Record<string, object>} [presets]   default entity mappings
 * @property {(ctx: ConnectorContext) => Promise<{ ok: boolean, message: string }>} test
 * @property {(ctx: ConnectorContext) => Promise<Stream[]>} listStreams
 * @property {(ctx: ConnectorContext, streamId: string, opts: { cursor: string|null, limit?: number }) => AsyncGenerator<{ records: object[], cursor?: string|null }>} read
 */

/** @param {Connector} connector */
export function defineConnector(connector) {
  for (const key of ['id', 'name', 'fields', 'test', 'listStreams', 'read']) {
    if (!connector[key]) throw new Error(`Connector ${connector.id ?? '?'} is missing "${key}"`)
  }
  return connector
}

export const isVisible = (field, values) => !field.showIf || field.showIf.in.includes(values[field.showIf.key] ?? fieldDefault(field.showIf.key))

let defaultsLookup = () => undefined
const fieldDefault = (key) => defaultsLookup(key)

// Split a flat values object into config + secrets according to the schema and
// apply defaults. Unknown keys are dropped.
export function splitValues(connector, values = {}) {
  const config = {}
  const secrets = {}
  defaultsLookup = (key) => connector.fields.find((f) => f.key === key)?.default
  for (const f of connector.fields) {
    let v = values[f.key]
    if (v === undefined) {
      if (f.secret) continue
      v = f.default
    }
    if (f.type === 'number' && v !== undefined && v !== '') v = Number(v)
    if (f.type === 'boolean') v = v === true || v === 'true'
    if (f.type === 'json' && typeof v === 'string') {
      try {
        v = v.trim() ? JSON.parse(v) : f.default
      } catch {
        throw new Error(`${f.label}: invalid JSON`)
      }
    }
    if (f.secret) secrets[f.key] = v
    else config[f.key] = v
  }
  return { config, secrets }
}

export function missingRequired(connector, config, secrets) {
  const all = { ...config, ...secrets }
  defaultsLookup = (key) => connector.fields.find((f) => f.key === key)?.default
  return connector.fields.filter((f) => f.required && isVisible(f, all) && (all[f.key] === undefined || all[f.key] === null || all[f.key] === '')).map((f) => f.label)
}

// Public, serialisable description for the browser.
export function describeConnector(c) {
  return {
    id: c.id,
    name: c.name,
    vendor: c.vendor,
    description: c.description,
    docsUrl: c.docsUrl ?? null,
    category: c.category ?? 'crm',
    fields: c.fields,
    templates: c.templates ?? [],
    presets: c.presets ?? {},
  }
}

export const trimSlash = (s) => String(s ?? '').replace(/\/+$/, '')
