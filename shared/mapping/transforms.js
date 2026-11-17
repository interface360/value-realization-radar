// Declarative value transforms. Mappings are data, never code, so a tenant's
// mapping can't execute anything on the sync server.

const isEmpty = (v) => v === undefined || v === null || (typeof v === 'string' && v.trim() === '')

function toNumber(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  if (typeof v === 'boolean') return v ? 1 : 0
  if (isEmpty(v)) return null
  const s = String(v).trim()
  const negative = /^\(.*\)$/.test(s) // accounting format (1,234)
  const n = Number(s.replace(/[^0-9.eE+-]/g, ''))
  if (!Number.isFinite(n)) return null
  return negative ? -n : n
}

function toDate(v) {
  if (isEmpty(v)) return null
  let d
  if (v instanceof Date) d = v
  else if (typeof v === 'number' || /^\d{10,13}$/.test(String(v).trim())) {
    const n = Number(v)
    d = new Date(n < 1e11 ? n * 1000 : n) // epoch seconds or ms
  } else {
    const s = String(v).trim()
    // ServiceNow "2026-01-31 14:00:00" and plain dates
    const iso = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(s) ? s.replace(' ', 'T') + 'Z' : s
    const us = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s)
    d = us ? new Date(Date.UTC(+us[3], +us[1] - 1, +us[2])) : new Date(/^\d{4}-\d{2}-\d{2}$/.test(iso) ? `${iso}T00:00:00Z` : iso)
  }
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10)
}

const each = (fn) => (v) => (Array.isArray(v) ? v.map(fn) : fn(v))

export const TRANSFORMS = {
  trim: { label: 'Trim whitespace', fn: each((v) => (typeof v === 'string' ? v.trim() : v)) },
  lower: { label: 'Lowercase', fn: each((v) => (typeof v === 'string' ? v.toLowerCase() : v)) },
  upper: { label: 'Uppercase', fn: each((v) => (typeof v === 'string' ? v.toUpperCase() : v)) },
  number: { label: 'To number', fn: each(toNumber) },
  integer: { label: 'To integer', fn: each((v) => (toNumber(v) == null ? null : Math.round(toNumber(v)))) },
  date: { label: 'To date (YYYY-MM-DD)', fn: each(toDate) },
  boolean: { label: 'To boolean', fn: each((v) => (isEmpty(v) ? null : ['true', '1', 'yes', 'y'].includes(String(v).toLowerCase()))) },
  first: { label: 'First item of list', fn: (v) => (Array.isArray(v) ? v[0] : v) },
  last: { label: 'Last item of list', fn: (v) => (Array.isArray(v) ? v[v.length - 1] : v) },
  sum: { label: 'Sum list', fn: (v) => (Array.isArray(v) ? v.reduce((s, x) => s + (toNumber(x) ?? 0), 0) : v) },
  count: { label: 'Count list', fn: (v) => (Array.isArray(v) ? v.length : isEmpty(v) ? 0 : 1) },
  join: { label: 'Join list', fn: (v) => (Array.isArray(v) ? v.filter((x) => !isEmpty(x)).join(', ') : v) },
  multiply: { label: 'Multiply by', arg: 'number', fn: (v, a) => (toNumber(v) == null ? v : toNumber(v) * Number(a)) },
  divide: { label: 'Divide by', arg: 'number', fn: (v, a) => (toNumber(v) == null || !Number(a) ? v : toNumber(v) / Number(a)) },
  round: { label: 'Round to decimals', arg: 'number', fn: (v, a) => (toNumber(v) == null ? v : Number(toNumber(v).toFixed(Number(a) || 0))) },
  split: { label: 'Split by', arg: 'text', fn: (v, a) => (typeof v === 'string' ? v.split(a || ',').map((s) => s.trim()) : v) },
  replace: { label: 'Remove text', arg: 'text', fn: each((v, a) => (typeof v === 'string' && a ? v.split(a).join('') : v)) },
}

// "multiply:12" → { name: 'multiply', arg: '12' }
export function parseTransform(spec) {
  const i = spec.indexOf(':')
  return i < 0 ? { name: spec, arg: undefined } : { name: spec.slice(0, i), arg: spec.slice(i + 1) }
}

export function applyTransforms(value, specs = []) {
  let v = value
  for (const spec of specs) {
    const { name, arg } = parseTransform(spec)
    const t = TRANSFORMS[name]
    if (!t) throw new Error(`Unknown transform "${name}"`)
    v = t.fn(v, arg)
  }
  return v
}

export { isEmpty, toDate, toNumber }
