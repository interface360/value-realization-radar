import { db, TABLES } from './schema.js'
import { buildSeed } from './seed.js'

// Every UI write goes through these functions so modules never touch tables
// directly. Each write also appends to the activity log.

const now = () => new Date().toISOString()

function log(account_id, kind, message) {
  return db.activity.add({ account_id, at: now(), kind, message })
}

export async function startIntervention(accountId, type, details = {}) {
  return db.transaction('rw', db.interventions, db.activity, async () => {
    const existing = await db.interventions.where({ account_id: accountId }).filter((i) => i.type === type && i.status === 'Active').first()
    if (existing) {
      await db.interventions.update(existing.id, { details: { ...existing.details, ...details }, updated_at: now() })
      await log(accountId, 'intervention', `${type} updated`)
      return existing.id
    }
    const id = await db.interventions.add({ account_id: accountId, type, status: 'Active', created_at: now(), details })
    await log(accountId, 'intervention', `${type} started`)
    return id
  })
}

export async function resolveIntervention(interventionId) {
  return db.transaction('rw', db.interventions, db.activity, async () => {
    const item = await db.interventions.get(interventionId)
    if (!item) return
    await db.interventions.update(interventionId, { status: 'Resolved', resolved_at: now() })
    await log(item.account_id, 'intervention', `${item.type} completed`)
  })
}

// Logging a blocker on an on-track project downgrades it to Delayed.
export async function logBlocker(projectId, blockerType) {
  return db.transaction('rw', db.projects, db.activity, async () => {
    const project = await db.projects.get(projectId)
    if (!project) return
    const status = project.status === 'On Track' ? 'Delayed' : project.status
    await db.projects.update(projectId, { blocker_type: blockerType, status })
    await log(project.account_id, 'blocker', `${blockerType} blocker logged on ${project.name}`)
  })
}

export async function clearBlocker(projectId) {
  return db.transaction('rw', db.projects, db.activity, async () => {
    const project = await db.projects.get(projectId)
    if (!project) return
    await db.projects.update(projectId, { blocker_type: 'None', status: 'On Track' })
    await log(project.account_id, 'blocker', `${project.name} unblocked`)
  })
}

export async function resetDatabase() {
  const tables = TABLES.map((t) => db.table(t))
  return db.transaction('rw', tables, async () => {
    await Promise.all(tables.map((t) => t.clear()))
    const data = buildSeed()
    await Promise.all(Object.entries(data).map(([table, rows]) => db.table(table).bulkAdd(rows)))
  })
}
