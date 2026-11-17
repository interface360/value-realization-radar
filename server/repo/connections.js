import { decrypt, encrypt, newId } from '../lib/crypto.js'
import { nowIso } from './db.js'

// Tenant-scoped repository for connections, runs and cursors. Secrets are
// encrypted at rest and never returned to the client — only which keys are set.

const parse = (s, fallback) => {
  try {
    return s ? JSON.parse(s) : fallback
  } catch {
    return fallback
  }
}

export function connectionsRepo(db, tenantId) {
  const hydrate = (row, { withSecrets = false } = {}) => {
    if (!row) return null
    const secrets = row.secrets ? decrypt(row.secrets) : {}
    const out = {
      id: row.id,
      name: row.name,
      connector: row.connector,
      config: parse(row.config, {}),
      mapping: parse(row.mapping, {}),
      schedule_minutes: row.schedule_minutes,
      enabled: Boolean(row.enabled),
      status: row.status,
      last_sync_at: row.last_sync_at,
      last_success_at: row.last_success_at,
      last_error: row.last_error,
      next_sync_at: row.next_sync_at,
      created_at: row.created_at,
      updated_at: row.updated_at,
      secrets_set: Object.keys(secrets).filter((k) => secrets[k] !== '' && secrets[k] != null),
    }
    if (withSecrets) out.secrets = secrets
    return out
  }

  const nextSync = (minutes) => (minutes ? new Date(Date.now() + minutes * 60_000).toISOString() : null)

  return {
    list() {
      return db.prepare('SELECT * FROM connections WHERE tenant_id = ? ORDER BY created_at').all(tenantId).map((r) => hydrate(r))
    },
    get(id, opts) {
      return hydrate(db.prepare('SELECT * FROM connections WHERE tenant_id = ? AND id = ?').get(tenantId, id), opts)
    },
    create({ name, connector, config = {}, secrets = {}, mapping = {}, schedule_minutes = null }) {
      const id = newId('c').toLowerCase()
      const ts = nowIso()
      db.prepare(
        `INSERT INTO connections (id, tenant_id, name, connector, config, secrets, mapping, schedule_minutes, next_sync_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(id, tenantId, name, connector, JSON.stringify(config), encrypt(secrets), JSON.stringify(mapping), schedule_minutes, nextSync(schedule_minutes), ts, ts)
      return this.get(id)
    },
    update(id, patch) {
      const current = this.get(id, { withSecrets: true })
      if (!current) return null
      // Secrets merge: omitted keys keep their value; empty string clears a key.
      const secrets = { ...current.secrets }
      for (const [k, v] of Object.entries(patch.secrets ?? {})) {
        if (v === '') delete secrets[k]
        else if (v !== undefined && v !== null) secrets[k] = v
      }
      const next = {
        name: patch.name ?? current.name,
        config: patch.config ?? current.config,
        mapping: patch.mapping ?? current.mapping,
        schedule_minutes: patch.schedule_minutes !== undefined ? patch.schedule_minutes : current.schedule_minutes,
        enabled: patch.enabled !== undefined ? patch.enabled : current.enabled,
      }
      db.prepare(
        `UPDATE connections SET name = ?, config = ?, secrets = ?, mapping = ?, schedule_minutes = ?, enabled = ?, next_sync_at = ?, updated_at = ?
         WHERE tenant_id = ? AND id = ?`,
      ).run(
        next.name,
        JSON.stringify(next.config),
        encrypt(secrets),
        JSON.stringify(next.mapping),
        next.schedule_minutes,
        next.enabled ? 1 : 0,
        next.enabled ? nextSync(next.schedule_minutes) : null,
        nowIso(),
        tenantId,
        id,
      )
      return this.get(id)
    },
    // Persist refreshed OAuth tokens etc. without touching other fields.
    patchSecrets(id, patch) {
      const current = this.get(id, { withSecrets: true })
      if (!current) return
      db.prepare('UPDATE connections SET secrets = ? WHERE tenant_id = ? AND id = ?').run(encrypt({ ...current.secrets, ...patch }), tenantId, id)
    },
    setStatus(id, { status, error = null, success = false }) {
      const ts = nowIso()
      const conn = this.get(id)
      db.prepare(
        `UPDATE connections SET status = ?, last_error = ?, last_sync_at = ?, last_success_at = COALESCE(?, last_success_at), next_sync_at = ?
         WHERE tenant_id = ? AND id = ?`,
      ).run(status, error, ts, success ? ts : null, conn?.enabled ? nextSync(conn.schedule_minutes) : null, tenantId, id)
    },
    remove(id, { purgeData = true } = {}) {
      if (purgeData) {
        for (const table of ['accounts', 'telemetry', 'usage', 'projects']) db.prepare(`DELETE FROM ${table} WHERE tenant_id = ? AND source = ?`).run(tenantId, id)
      }
      db.prepare('DELETE FROM connections WHERE tenant_id = ? AND id = ?').run(tenantId, id)
    },

    // ── cursors ───────────────────────────────────────────────────────────
    getCursor(connectionId, stream) {
      return db.prepare('SELECT cursor FROM sync_cursors WHERE tenant_id = ? AND connection_id = ? AND stream = ?').get(tenantId, connectionId, stream)?.cursor ?? null
    },
    setCursor(connectionId, stream, cursor) {
      db.prepare(
        `INSERT INTO sync_cursors (tenant_id, connection_id, stream, cursor) VALUES (?, ?, ?, ?)
         ON CONFLICT (tenant_id, connection_id, stream) DO UPDATE SET cursor = excluded.cursor`,
      ).run(tenantId, connectionId, stream, cursor)
    },
    clearCursors(connectionId) {
      db.prepare('DELETE FROM sync_cursors WHERE tenant_id = ? AND connection_id = ?').run(tenantId, connectionId)
    },

    // ── runs ──────────────────────────────────────────────────────────────
    startRun(connectionId, { trigger, mode }) {
      const id = newId('r').toLowerCase()
      db.prepare('INSERT INTO sync_runs (id, tenant_id, connection_id, trigger, mode, status, started_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run(
        id,
        tenantId,
        connectionId,
        trigger,
        mode,
        'running',
        nowIso(),
      )
      db.prepare("UPDATE connections SET status = 'syncing' WHERE tenant_id = ? AND id = ?").run(tenantId, connectionId)
      return id
    },
    finishRun(runId, { status, stats, log, error = null }) {
      db.prepare('UPDATE sync_runs SET status = ?, finished_at = ?, stats = ?, log = ?, error = ? WHERE tenant_id = ? AND id = ?').run(
        status,
        nowIso(),
        JSON.stringify(stats),
        JSON.stringify(log.slice(-200)),
        error,
        tenantId,
        runId,
      )
    },
    listRuns(connectionId, limit = 20) {
      return db
        .prepare('SELECT * FROM sync_runs WHERE tenant_id = ? AND connection_id = ? ORDER BY started_at DESC LIMIT ?')
        .all(tenantId, connectionId, limit)
        .map((r) => ({ ...r, stats: parse(r.stats, {}), log: parse(r.log, []) }))
    },
    isRunning(connectionId) {
      return Boolean(db.prepare("SELECT 1 FROM sync_runs WHERE tenant_id = ? AND connection_id = ? AND status = 'running'").get(tenantId, connectionId))
    },
  }
}

// Cross-tenant query used only by the scheduler.
export function dueConnections(db, now = new Date()) {
  return db
    .prepare("SELECT tenant_id, id FROM connections WHERE enabled = 1 AND schedule_minutes IS NOT NULL AND next_sync_at IS NOT NULL AND next_sync_at <= ? AND status != 'syncing'")
    .all(now.toISOString())
}

// Runs left "running" by a crashed process.
export function recoverStaleRuns(db) {
  db.prepare("UPDATE sync_runs SET status = 'failed', error = 'Interrupted (server restarted)', finished_at = ? WHERE status = 'running'").run(nowIso())
  db.prepare("UPDATE connections SET status = 'error', last_error = 'Interrupted (server restarted)' WHERE status = 'syncing'").run()
}
