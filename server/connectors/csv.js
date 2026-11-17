import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseCsv } from '../lib/csv.js'
import { request } from '../lib/fetch.js'
import { defineConnector } from './define.js'

// CSV / spreadsheet exports. Each uploaded file (or remote CSV URL) is a stream.
// The quickest way to bring data from any CRM: export a report, upload, map.

const uploadsDir = (ctx) => join(ctx.dataDir, 'uploads', ctx.tenantId, ctx.connectionId)
const safeName = (name) => String(name).replace(/[^A-Za-z0-9._-]/g, '_').replace(/\.csv$/i, '')

export function saveUpload({ dataDir, tenantId, connectionId, filename, content }) {
  const dir = join(dataDir, 'uploads', tenantId, connectionId)
  mkdirSync(dir, { recursive: true })
  const id = safeName(filename)
  const rows = parseCsv(content)
  writeFileSync(join(dir, `${id}.csv`), content)
  return { id, rows: rows.length, columns: rows[0] ? Object.keys(rows[0]) : [] }
}

export function removeUploads({ dataDir, tenantId, connectionId }) {
  rmSync(join(dataDir, 'uploads', tenantId, connectionId), { recursive: true, force: true })
}

function urlStreams(config) {
  return String(config.urls ?? '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line) => {
      const [name, url] = line.includes('=') && !line.startsWith('http') ? line.split(/=(.+)/).map((s) => s.trim()) : [null, line]
      return { id: safeName(name ?? (new URL(url).pathname.split('/').pop() || 'remote')), url }
    })
}

export default defineConnector({
  id: 'csv',
  name: 'CSV / spreadsheet',
  vendor: 'Generic',
  category: 'file',
  description: 'Upload CSV exports from any CRM, BI tool or spreadsheet — or point at CSV URLs (e.g. a published Google Sheet).',
  fields: [
    {
      key: 'urls',
      label: 'Remote CSV URLs (optional)',
      type: 'textarea',
      placeholder: 'accounts = https://docs.google.com/spreadsheets/d/…/export?format=csv\nusage = https://warehouse.example.com/exports/usage.csv',
      help: 'One per line, optionally "name = url". Uploaded files appear as streams automatically.',
    },
  ],

  async test(ctx) {
    const streams = await this.listStreams(ctx)
    return { ok: true, message: streams.length ? `${streams.length} file(s) available` : 'Ready — upload a CSV file to create a stream' }
  },

  async listStreams(ctx) {
    const dir = uploadsDir(ctx)
    const uploaded = existsSync(dir)
      ? readdirSync(dir)
          .filter((f) => f.endsWith('.csv'))
          .map((f) => ({ id: f.replace(/\.csv$/, ''), label: `${f} (uploaded)` }))
      : []
    const remote = urlStreams(ctx.config).map((s) => ({ id: s.id, label: `${s.id} (remote)`, description: s.url }))
    return [...uploaded, ...remote]
  },

  async *read(ctx, streamId, { limit }) {
    const file = join(uploadsDir(ctx), `${safeName(streamId)}.csv`)
    let text
    if (existsSync(file)) text = readFileSync(file, 'utf8')
    else {
      const remote = urlStreams(ctx.config).find((s) => s.id === streamId)
      if (!remote) throw new Error(`No uploaded file or URL named "${streamId}"`)
      text = (await request(remote.url, { raw: true, headers: { accept: 'text/csv,*/*' } })).text
    }
    const rows = parseCsv(text)
    const out = limit ? rows.slice(0, limit) : rows
    for (let i = 0; i < out.length; i += 1000) yield { records: out.slice(i, i + 1000) }
  },
})
