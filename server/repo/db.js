import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

// Multi-tenant store (SQLite via node:sqlite). Every business table carries a
// tenant_id and every query in repo/*.js is scoped by it. Swap this file for a
// Postgres adapter in production — the repository API stays the same.

const MIGRATIONS = [
  `
  CREATE TABLE tenants (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    api_key_hash TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE connections (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    connector TEXT NOT NULL,
    config TEXT NOT NULL DEFAULT '{}',
    secrets TEXT,
    mapping TEXT NOT NULL DEFAULT '{}',
    schedule_minutes INTEGER,
    enabled INTEGER NOT NULL DEFAULT 1,
    status TEXT NOT NULL DEFAULT 'new',
    last_sync_at TEXT,
    last_success_at TEXT,
    last_error TEXT,
    next_sync_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX idx_connections_tenant ON connections(tenant_id);

  CREATE TABLE sync_runs (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    connection_id TEXT NOT NULL REFERENCES connections(id) ON DELETE CASCADE,
    trigger TEXT NOT NULL,
    mode TEXT NOT NULL,
    status TEXT NOT NULL,
    started_at TEXT NOT NULL,
    finished_at TEXT,
    stats TEXT NOT NULL DEFAULT '{}',
    log TEXT NOT NULL DEFAULT '[]',
    error TEXT
  );
  CREATE INDEX idx_runs_connection ON sync_runs(tenant_id, connection_id, started_at);

  CREATE TABLE sync_cursors (
    tenant_id TEXT NOT NULL,
    connection_id TEXT NOT NULL REFERENCES connections(id) ON DELETE CASCADE,
    stream TEXT NOT NULL,
    cursor TEXT,
    PRIMARY KEY (tenant_id, connection_id, stream)
  );

  -- Synced business data. Keys are namespaced per source: "<connection_id>:<external_id>".
  CREATE TABLE accounts (
    tenant_id TEXT NOT NULL,
    id TEXT NOT NULL,
    source TEXT NOT NULL,
    external_id TEXT NOT NULL,
    name TEXT NOT NULL,
    arr_value REAL NOT NULL,
    renewal_date TEXT NOT NULL,
    sponsor_name TEXT,
    synced_at TEXT NOT NULL,
    PRIMARY KEY (tenant_id, id)
  );
  CREATE INDEX idx_accounts_ext ON accounts(tenant_id, external_id);
  CREATE INDEX idx_accounts_name ON accounts(tenant_id, name COLLATE NOCASE);

  CREATE TABLE telemetry (
    tenant_id TEXT NOT NULL,
    account_id TEXT NOT NULL,
    source TEXT NOT NULL,
    purchased_capacity REAL NOT NULL,
    consumed_capacity REAL NOT NULL,
    last_active_date TEXT,
    synced_at TEXT NOT NULL,
    PRIMARY KEY (tenant_id, account_id)
  );

  CREATE TABLE usage (
    tenant_id TEXT NOT NULL,
    account_id TEXT NOT NULL,
    week_start TEXT NOT NULL,
    source TEXT NOT NULL,
    consumed REAL NOT NULL,
    synced_at TEXT NOT NULL,
    PRIMARY KEY (tenant_id, account_id, week_start)
  );

  CREATE TABLE projects (
    tenant_id TEXT NOT NULL,
    id TEXT NOT NULL,
    source TEXT NOT NULL,
    external_id TEXT NOT NULL,
    account_id TEXT NOT NULL,
    name TEXT NOT NULL,
    status TEXT NOT NULL,
    blocker_type TEXT NOT NULL DEFAULT 'None',
    synced_at TEXT NOT NULL,
    PRIMARY KEY (tenant_id, id)
  );
  CREATE INDEX idx_projects_account ON projects(tenant_id, account_id);

  -- Written by the VRR app (not synced from sources).
  CREATE TABLE interventions (
    tenant_id TEXT NOT NULL,
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    account_id TEXT NOT NULL,
    type TEXT NOT NULL,
    status TEXT NOT NULL,
    details TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL,
    updated_at TEXT,
    resolved_at TEXT
  );
  CREATE INDEX idx_interventions_tenant ON interventions(tenant_id, account_id);

  CREATE TABLE activity (
    tenant_id TEXT NOT NULL,
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    account_id TEXT,
    at TEXT NOT NULL,
    kind TEXT NOT NULL,
    message TEXT NOT NULL
  );
  CREATE INDEX idx_activity_tenant ON activity(tenant_id, account_id, at);

  -- Project status/blocker edits made in VRR survive later syncs.
  CREATE TABLE project_overrides (
    tenant_id TEXT NOT NULL,
    project_id TEXT NOT NULL,
    status TEXT,
    blocker_type TEXT,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (tenant_id, project_id)
  );
  `,
]

export function openDatabase(dataDir) {
  mkdirSync(dataDir, { recursive: true })
  const db = new DatabaseSync(join(dataDir, 'vrr.sqlite'))
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;')
  db.exec('CREATE TABLE IF NOT EXISTS schema_version (version INTEGER NOT NULL)')
  const current = db.prepare('SELECT version FROM schema_version').get()?.version ?? 0
  for (let v = current; v < MIGRATIONS.length; v++) {
    db.exec('BEGIN')
    try {
      db.exec(MIGRATIONS[v])
      if (v === 0) db.prepare('INSERT INTO schema_version (version) VALUES (?)').run(v + 1)
      else db.prepare('UPDATE schema_version SET version = ?').run(v + 1)
      db.exec('COMMIT')
    } catch (e) {
      db.exec('ROLLBACK')
      throw e
    }
  }
  return db
}

export function transaction(db, fn) {
  db.exec('BEGIN')
  try {
    const result = fn()
    db.exec('COMMIT')
    return result
  } catch (e) {
    db.exec('ROLLBACK')
    throw e
  }
}

export const nowIso = () => new Date().toISOString()
