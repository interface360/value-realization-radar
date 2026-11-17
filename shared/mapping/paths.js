// Path syntax for reading values out of source records:
//   Name                     plain key
//   Owner.Name               nested object
//   Contracts.records[0].x   array index
//   lines[*].amount          every element (returns an array)
//   ["@odata.nextLink"]      quoted key containing dots

const TOKEN = /\["([^"]+)"\]|\[(\d+|\*)\]|([^.[\]]+)/g

export function parsePath(path) {
  const tokens = []
  for (const m of String(path).matchAll(TOKEN)) {
    if (m[1] !== undefined) tokens.push(m[1])
    else if (m[2] !== undefined) tokens.push(m[2] === '*' ? '*' : Number(m[2]))
    else tokens.push(m[3])
  }
  return tokens
}

function readKey(obj, key) {
  if (obj == null || typeof obj !== 'object') return undefined
  if (key in obj) return obj[key]
  // Case-insensitive fallback (CSV headers, inconsistent API casing).
  const lower = String(key).toLowerCase()
  const match = Object.keys(obj).find((k) => k.toLowerCase() === lower)
  return match === undefined ? undefined : obj[match]
}

export function getPath(obj, path) {
  if (path == null || path === '') return undefined
  let current = [obj]
  let spread = false
  for (const token of parsePath(path)) {
    const next = []
    for (const item of current) {
      if (item == null) continue
      if (token === '*') {
        spread = true
        if (Array.isArray(item)) next.push(...item)
      } else if (typeof token === 'number') {
        next.push(Array.isArray(item) ? item[token] : undefined)
      } else {
        next.push(readKey(item, token))
      }
    }
    current = next
  }
  return spread ? current.filter((v) => v !== undefined) : current[0]
}

const SKIP_KEYS = new Set(['attributes']) // Salesforce metadata

const formatKey = (key) => (/^[A-Za-z_$][\w$-]*$/.test(key) ? key : `["${key}"]`)

const MAX_DISTINCT = 50

/**
 * Discover every readable path in a set of sample records.
 * `values` holds up to 50 distinct scalar values (for enum value maps).
 * @returns {{ path: string, type: string, samples: any[], values: any[], filled: number }[]}
 */
export function discoverPaths(records, { maxDepth = 5 } = {}) {
  const found = new Map()
  const visit = (value, path, depth) => {
    if (value && typeof value === 'object' && !Array.isArray(value) && depth < maxDepth) {
      for (const [k, v] of Object.entries(value)) {
        if (SKIP_KEYS.has(k)) continue
        const key = formatKey(k)
        visit(v, path ? (key.startsWith('[') ? `${path}${key}` : `${path}.${key}`) : key, depth + 1)
      }
      return
    }
    if (Array.isArray(value) && depth < maxDepth) {
      if (value.length && typeof value[0] === 'object') visit(value[0], `${path}[0]`, depth + 1)
      record(path, value)
      return
    }
    record(path, value)
  }
  const record = (path, value) => {
    if (!path) return
    const entry = found.get(path) ?? { path, type: 'empty', samples: [], values: [], filled: 0 }
    if (value !== null && value !== undefined && value !== '') {
      entry.filled += 1
      const type = Array.isArray(value) ? 'array' : typeof value
      entry.type = entry.type === 'empty' || entry.type === type ? type : 'mixed'
      const sample = Array.isArray(value) ? `[${value.length} items]` : value
      if (entry.samples.length < 3 && !entry.samples.includes(sample)) entry.samples.push(sample)
      if (!Array.isArray(value) && entry.values.length < MAX_DISTINCT && !entry.values.includes(value)) entry.values.push(value)
    }
    found.set(path, entry)
  }
  for (const r of records) visit(r, '', 0)
  return [...found.values()].map((e) => ({ ...e, filled: records.length ? e.filled / records.length : 0 }))
}
