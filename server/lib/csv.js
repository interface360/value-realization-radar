// RFC 4180 CSV parser: quoted fields, escaped quotes, CRLF/LF, BOM.
// Auto-detects comma, semicolon or tab delimiters from the header line.

export function parseCsv(text) {
  const src = text.replace(/^﻿/, '')
  const firstLine = src.slice(0, src.search(/\r?\n/) >>> 0 || src.length)
  const delimiter = [',', ';', '\t'].map((d) => [d, firstLine.split(d).length]).sort((a, b) => b[1] - a[1])[0][0]

  const rows = []
  let row = []
  let field = ''
  let quoted = false
  for (let i = 0; i < src.length; i++) {
    const c = src[i]
    if (quoted) {
      if (c === '"' && src[i + 1] === '"') {
        field += '"'
        i++
      } else if (c === '"') quoted = false
      else field += c
      continue
    }
    if (c === '"' && field === '') quoted = true
    else if (c === delimiter) {
      row.push(field)
      field = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else field += c
  }
  if (field !== '' || row.length) {
    row.push(field)
    rows.push(row)
  }

  const [header = [], ...body] = rows.filter((r) => r.some((v) => v.trim() !== ''))
  const keys = header.map((h, i) => h.trim() || `column_${i + 1}`)
  return body.map((r) => Object.fromEntries(keys.map((k, i) => [k, r[i] ?? ''])))
}
