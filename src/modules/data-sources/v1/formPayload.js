// Values worth sending: drop untouched secrets so saved ones aren't cleared.
export function formPayload(connector, values) {
  const out = {}
  for (const f of connector.fields) {
    const v = values[f.key]
    if (v === undefined) continue
    if (f.secret && v === '') continue
    out[f.key] = v
  }
  return out
}
