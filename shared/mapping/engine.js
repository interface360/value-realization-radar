import { getPath } from './paths.js'
import { TARGET_SCHEMA } from './targetSchema.js'
import { applyTransforms, isEmpty, toDate, toNumber } from './transforms.js'

/**
 * Field mapping spec (all keys optional except one of source/value):
 * {
 *   source: 'Owner.Name',            // path into the source record
 *   value: 'On Track',               // constant instead of a path
 *   transforms: ['trim', 'number'],  // applied in order
 *   valueMap: { 'At Risk': 'Delayed' }, // enum lookup (case-insensitive)
 *   default: 'None',                 // when the result is empty / unmapped
 * }
 *
 * Entity mapping spec:
 * { enabled, stream, accountMatch, fields: { [targetField]: FieldMapping } }
 */

function coerce(value, type) {
  if (value === null || value === undefined) return null
  switch (type) {
    case 'number':
      return toNumber(Array.isArray(value) ? value[0] : value)
    case 'date':
      return toDate(Array.isArray(value) ? value[0] : value)
    case 'string':
    case 'ref':
    case 'enum':
      if (Array.isArray(value)) return value.length ? String(value[0]) : null
      return isEmpty(value) ? null : String(value).trim()
    default:
      return value
  }
}

function lookup(valueMap, raw) {
  if (!valueMap || raw == null) return undefined
  const key = String(raw)
  if (key in valueMap) return valueMap[key]
  const lower = key.toLowerCase()
  const hit = Object.keys(valueMap).find((k) => k.toLowerCase() === lower)
  return hit === undefined ? undefined : valueMap[hit]
}

export function mapField(record, spec, def) {
  if (!spec) return { value: def.defaultValue ?? null }
  let raw = spec.value !== undefined && spec.value !== '' ? spec.value : getPath(record, spec.source)
  try {
    raw = applyTransforms(raw, spec.transforms)
  } catch (e) {
    return { value: null, error: e.message }
  }

  let unmapped
  if (def.type === 'enum') {
    const mapped = lookup(spec.valueMap, raw)
    const direct = def.values.find((v) => v.toLowerCase() === String(raw ?? '').toLowerCase())
    const result = mapped ?? direct
    if (result === undefined && !isEmpty(raw)) unmapped = String(raw)
    raw = result
  }

  let value = coerce(raw, def.type)
  if (value === null && spec.default !== undefined && spec.default !== '') value = coerce(spec.default, def.type)
  if (value === null && def.defaultValue !== undefined) value = def.defaultValue
  if (def.type === 'enum' && value !== null && !def.values.includes(value)) return { value: null, error: `"${value}" is not one of ${def.values.join(', ')}`, unmapped }
  return { value, unmapped }
}

/**
 * Map raw source records into target rows.
 * @returns {{ rows: object[], rejected: {index:number, reasons:string[], record:object}[], unmappedValues: Record<string, Record<string, number>> }}
 */
export function applyEntityMapping(records, entity, mapping) {
  const schema = TARGET_SCHEMA[entity]
  if (!schema) throw new Error(`Unknown target entity "${entity}"`)
  const rows = []
  const rejected = []
  const unmappedValues = {}

  records.forEach((record, index) => {
    const row = {}
    const reasons = []
    for (const [field, def] of Object.entries(schema.fields)) {
      const { value, error, unmapped } = mapField(record, mapping.fields?.[field], def)
      if (unmapped) {
        unmappedValues[field] ??= {}
        unmappedValues[field][unmapped] = (unmappedValues[field][unmapped] ?? 0) + 1
      }
      if (error) reasons.push(`${field}: ${error}`)
      else if (def.required && (value === null || value === undefined || value === '')) reasons.push(`${field}: required value is empty`)
      row[field] = value
    }
    if (reasons.length) rejected.push({ index, reasons, record })
    else rows.push(row)
  })

  return { rows, rejected, unmappedValues }
}

export function validateMapping(entity, mapping) {
  const schema = TARGET_SCHEMA[entity]
  const problems = []
  if (!mapping?.stream) problems.push('Choose a source object / stream')
  for (const [field, def] of Object.entries(schema.fields)) {
    const spec = mapping?.fields?.[field]
    const hasSource = spec && ((spec.source ?? '') !== '' || (spec.value ?? '') !== '' || (spec.default ?? '') !== '')
    if (def.required && !hasSource && def.defaultValue === undefined) problems.push(`${def.label} is required`)
  }
  return problems
}
