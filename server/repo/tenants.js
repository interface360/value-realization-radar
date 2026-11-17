import { newApiKey, newId, parseApiKey, safeEqual, sha256 } from '../lib/crypto.js'
import { nowIso } from './db.js'

const slugify = (s) =>
  String(s)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40) || 'tenant'

export function tenantsRepo(db) {
  const publicView = (t) => t && { id: t.id, name: t.name, slug: t.slug, created_at: t.created_at }

  return {
    create(name) {
      const id = newId('t').toLowerCase()
      let slug = slugify(name)
      if (db.prepare('SELECT 1 FROM tenants WHERE slug = ?').get(slug)) slug = `${slug}-${id.slice(-5)}`
      const { key, hash } = newApiKey(id)
      db.prepare('INSERT INTO tenants (id, name, slug, api_key_hash, created_at) VALUES (?, ?, ?, ?, ?)').run(id, name, slug, hash, nowIso())
      return { tenant: publicView(this.get(id)), apiKey: key }
    },
    get(id) {
      return db.prepare('SELECT * FROM tenants WHERE id = ?').get(id)
    },
    list() {
      return db.prepare('SELECT * FROM tenants ORDER BY created_at').all().map(publicView)
    },
    rotateKey(id) {
      const { key, hash } = newApiKey(id)
      db.prepare('UPDATE tenants SET api_key_hash = ? WHERE id = ?').run(hash, id)
      return key
    },
    remove(id) {
      // Business tables have no FK to tenants (bulk upserts stay cheap), so clean them explicitly.
      for (const table of ['accounts', 'telemetry', 'usage', 'projects', 'interventions', 'activity', 'project_overrides', 'sync_cursors']) {
        db.prepare(`DELETE FROM ${table} WHERE tenant_id = ?`).run(id)
      }
      db.prepare('DELETE FROM tenants WHERE id = ?').run(id)
    },
    authenticate(apiKey) {
      const parsed = parseApiKey(apiKey)
      if (!parsed) return null
      const t = this.get(parsed.tenantId)
      return t && safeEqual(t.api_key_hash, sha256(parsed.secret)) ? publicView(t) : null
    },
    publicView,
  }
}
