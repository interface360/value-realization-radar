import { nowIso, transaction } from './db.js'

// Tenant-scoped synced business data + app writes (interventions, activity).

const parse = (s) => {
  try {
    return s ? JSON.parse(s) : {}
  } catch {
    return {}
  }
}

export function portfolioRepo(db, tenantId) {
  const log = (account_id, kind, message) =>
    db.prepare('INSERT INTO activity (tenant_id, account_id, at, kind, message) VALUES (?, ?, ?, ?, ?)').run(tenantId, account_id, nowIso(), kind, message)

  return {
    // ── reads ─────────────────────────────────────────────────────────────
    snapshot() {
      const q = (sql) => db.prepare(sql).all(tenantId)
      const overrides = new Map(q('SELECT * FROM project_overrides WHERE tenant_id = ?').map((o) => [o.project_id, o]))
      const usage = q('SELECT account_id, week_start, consumed FROM usage WHERE tenant_id = ? ORDER BY account_id, week_start')
      // The app's sparkline expects a 0-based week index per account.
      const weekIndex = new Map()
      return {
        accounts: q('SELECT id, name, arr_value, renewal_date, sponsor_name, source, external_id, synced_at FROM accounts WHERE tenant_id = ?'),
        telemetry: q('SELECT account_id, purchased_capacity, consumed_capacity, last_active_date, source, synced_at FROM telemetry WHERE tenant_id = ?'),
        usage: usage.map((u) => {
          const w = weekIndex.get(u.account_id) ?? 0
          weekIndex.set(u.account_id, w + 1)
          return { account_id: u.account_id, week: w, week_start: u.week_start, consumed: u.consumed }
        }),
        projects: q('SELECT id, account_id, name, status, blocker_type, source, external_id FROM projects WHERE tenant_id = ?').map((p) => {
          const o = overrides.get(p.id)
          return o ? { ...p, status: o.status ?? p.status, blocker_type: o.blocker_type ?? p.blocker_type, overridden: true } : p
        }),
        interventions: q('SELECT id, account_id, type, status, details, created_at, updated_at, resolved_at FROM interventions WHERE tenant_id = ?').map((i) => ({
          ...i,
          details: parse(i.details),
        })),
      }
    },
    activity(accountId, limit = 6) {
      return db.prepare('SELECT id, account_id, at, kind, message FROM activity WHERE tenant_id = ? AND account_id = ? ORDER BY at DESC, id DESC LIMIT ?').all(tenantId, accountId, limit)
    },
    counts() {
      const c = (t) => db.prepare(`SELECT COUNT(*) AS n FROM ${t} WHERE tenant_id = ?`).get(tenantId).n
      return { accounts: c('accounts'), telemetry: c('telemetry'), usage: c('usage'), projects: c('projects') }
    },

    // ── account resolution for child entities ─────────────────────────────
    resolver(sourceId, strategy) {
      const bySource = db.prepare('SELECT id FROM accounts WHERE tenant_id = ? AND source = ? AND external_id = ?')
      const byAny = db.prepare('SELECT id FROM accounts WHERE tenant_id = ? AND external_id = ? ORDER BY synced_at DESC LIMIT 1')
      const byName = db.prepare('SELECT id FROM accounts WHERE tenant_id = ? AND name = ? COLLATE NOCASE ORDER BY synced_at DESC LIMIT 1')
      const cache = new Map()
      return (ref) => {
        if (ref == null || ref === '') return null
        if (cache.has(ref)) return cache.get(ref)
        let hit
        if (strategy === 'name') hit = byName.get(tenantId, ref)
        else if (strategy === 'any_source') hit = byAny.get(tenantId, ref)
        else hit = bySource.get(tenantId, sourceId, ref)
        const id = hit?.id ?? null
        cache.set(ref, id)
        return id
      }
    },

    // ── upserts (called by the sync engine inside a transaction) ──────────
    upsertAccounts(sourceId, rows) {
      const stmt = db.prepare(
        `INSERT INTO accounts (tenant_id, id, source, external_id, name, arr_value, renewal_date, sponsor_name, synced_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (tenant_id, id) DO UPDATE SET name = excluded.name, arr_value = excluded.arr_value, renewal_date = excluded.renewal_date,
           sponsor_name = excluded.sponsor_name, synced_at = excluded.synced_at`,
      )
      const ts = nowIso()
      return transaction(db, () => {
        for (const r of rows) stmt.run(tenantId, `${sourceId}:${r.id}`, sourceId, r.id, r.name, r.arr_value, r.renewal_date, r.sponsor_name ?? null, ts)
        return rows.length
      })
    },
    upsertTelemetry(sourceId, rows) {
      const stmt = db.prepare(
        `INSERT INTO telemetry (tenant_id, account_id, source, purchased_capacity, consumed_capacity, last_active_date, synced_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (tenant_id, account_id) DO UPDATE SET source = excluded.source, purchased_capacity = excluded.purchased_capacity,
           consumed_capacity = excluded.consumed_capacity, last_active_date = COALESCE(excluded.last_active_date, telemetry.last_active_date), synced_at = excluded.synced_at`,
      )
      const ts = nowIso()
      return transaction(db, () => {
        for (const r of rows) stmt.run(tenantId, r.account_id, sourceId, r.purchased_capacity, r.consumed_capacity, r.last_active_date ?? null, ts)
        return rows.length
      })
    },
    upsertUsage(sourceId, rows) {
      const stmt = db.prepare(
        `INSERT INTO usage (tenant_id, account_id, week_start, source, consumed, synced_at) VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT (tenant_id, account_id, week_start) DO UPDATE SET consumed = excluded.consumed, source = excluded.source, synced_at = excluded.synced_at`,
      )
      const ts = nowIso()
      return transaction(db, () => {
        for (const r of rows) stmt.run(tenantId, r.account_id, r.week_start, sourceId, r.consumed, ts)
        return rows.length
      })
    },
    upsertProjects(sourceId, rows) {
      const stmt = db.prepare(
        `INSERT INTO projects (tenant_id, id, source, external_id, account_id, name, status, blocker_type, synced_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (tenant_id, id) DO UPDATE SET account_id = excluded.account_id, name = excluded.name, status = excluded.status,
           blocker_type = excluded.blocker_type, synced_at = excluded.synced_at`,
      )
      const ts = nowIso()
      return transaction(db, () => {
        for (const r of rows) stmt.run(tenantId, `${sourceId}:${r.id}`, sourceId, r.id, r.account_id, r.name, r.status, r.blocker_type ?? 'None', ts)
        return rows.length
      })
    },
    // Full-refresh cleanup: drop rows from this source not seen in the latest run.
    pruneSince(sourceId, table, sinceIso) {
      return db.prepare(`DELETE FROM ${table} WHERE tenant_id = ? AND source = ? AND synced_at < ?`).run(tenantId, sourceId, sinceIso).changes
    },

    // ── app writes (mirror of src/core/db/actions.js) ─────────────────────
    startIntervention(accountId, type, details = {}) {
      return transaction(db, () => {
        const existing = db.prepare("SELECT * FROM interventions WHERE tenant_id = ? AND account_id = ? AND type = ? AND status = 'Active'").get(tenantId, accountId, type)
        if (existing) {
          db.prepare('UPDATE interventions SET details = ?, updated_at = ? WHERE tenant_id = ? AND id = ?').run(
            JSON.stringify({ ...parse(existing.details), ...details }),
            nowIso(),
            tenantId,
            existing.id,
          )
          log(accountId, 'intervention', `${type} updated`)
          return existing.id
        }
        const { lastInsertRowid } = db
          .prepare("INSERT INTO interventions (tenant_id, account_id, type, status, details, created_at) VALUES (?, ?, ?, 'Active', ?, ?)")
          .run(tenantId, accountId, type, JSON.stringify(details), nowIso())
        log(accountId, 'intervention', `${type} started`)
        return Number(lastInsertRowid)
      })
    },
    resolveIntervention(id) {
      return transaction(db, () => {
        const item = db.prepare('SELECT * FROM interventions WHERE tenant_id = ? AND id = ?').get(tenantId, id)
        if (!item) return
        db.prepare("UPDATE interventions SET status = 'Resolved', resolved_at = ? WHERE tenant_id = ? AND id = ?").run(nowIso(), tenantId, id)
        log(item.account_id, 'intervention', `${item.type} completed`)
      })
    },
    setProjectOverride(projectId, patch, message) {
      return transaction(db, () => {
        const p = db.prepare('SELECT * FROM projects WHERE tenant_id = ? AND id = ?').get(tenantId, projectId)
        if (!p) return
        db.prepare(
          `INSERT INTO project_overrides (tenant_id, project_id, status, blocker_type, updated_at) VALUES (?, ?, ?, ?, ?)
           ON CONFLICT (tenant_id, project_id) DO UPDATE SET status = excluded.status, blocker_type = excluded.blocker_type, updated_at = excluded.updated_at`,
        ).run(tenantId, projectId, patch.status, patch.blocker_type, nowIso())
        log(p.account_id, 'blocker', message(p))
      })
    },
    project(projectId) {
      const p = db.prepare('SELECT * FROM projects WHERE tenant_id = ? AND id = ?').get(tenantId, projectId)
      if (!p) return null
      const o = db.prepare('SELECT * FROM project_overrides WHERE tenant_id = ? AND project_id = ?').get(tenantId, projectId)
      return o ? { ...p, status: o.status ?? p.status, blocker_type: o.blocker_type ?? p.blocker_type } : p
    },
    clearAppData() {
      for (const t of ['interventions', 'activity', 'project_overrides']) db.prepare(`DELETE FROM ${t} WHERE tenant_id = ?`).run(tenantId)
    },
  }
}
