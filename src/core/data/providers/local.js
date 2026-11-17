import { liveQuery } from 'dexie'
import * as dbActions from '../../db/actions.js'
import { db } from '../../db/schema.js'

// Embedded IndexedDB demo (no server). Same interface as the server provider.

export function createLocalProvider() {
  let snapshot = null
  let version = 0
  const listeners = new Set()
  let sub = null

  const query = liveQuery(async () => {
    const [accounts, telemetry, projects, interventions, usage] = await Promise.all([
      db.accounts.toArray(),
      db.telemetry.toArray(),
      db.projects.toArray(),
      db.interventions.toArray(),
      db.usage.toArray(),
    ])
    return { accounts, telemetry, projects, interventions, usage }
  })

  return {
    kind: 'local',
    subscribe(fn) {
      listeners.add(fn)
      if (!sub) {
        sub = query.subscribe({
          next: (s) => {
            snapshot = s
            version++
            for (const l of listeners) l()
          },
          error: (e) => console.error('[local provider]', e),
        })
      }
      return () => {
        listeners.delete(fn)
        if (!listeners.size) {
          sub?.unsubscribe()
          sub = null
        }
      }
    },
    getSnapshot: () => snapshot,
    getError: () => null,
    getVersion: () => version,
    refresh: async () => {},
    activity: (accountId, limit = 6) =>
      db.activity
        .where({ account_id: accountId })
        .reverse()
        .sortBy('at')
        .then((rows) => rows.slice(0, limit)),
    actions: {
      startIntervention: dbActions.startIntervention,
      resolveIntervention: dbActions.resolveIntervention,
      logBlocker: dbActions.logBlocker,
      clearBlocker: dbActions.clearBlocker,
      resetDatabase: dbActions.resetDatabase,
    },
  }
}
