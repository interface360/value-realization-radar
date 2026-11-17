import { dueConnections } from '../repo/connections.js'
import { runSync } from './engine.js'

// Polls for connections whose schedule is due and pulls them. One process,
// bounded concurrency; for horizontal scale move this to a job queue.

export function startScheduler({ db, dataDir, intervalMs = 30_000, concurrency = 2, logger = console }) {
  const active = new Set()
  let stopped = false

  async function tick() {
    if (stopped) return
    for (const { tenant_id, id } of dueConnections(db)) {
      const key = `${tenant_id}/${id}`
      if (active.has(key) || active.size >= concurrency) continue
      active.add(key)
      runSync({ db, dataDir, tenantId: tenant_id, connectionId: id, trigger: 'schedule' })
        .then((r) => logger.info?.(`[scheduler] ${key} → ${r.status}`))
        .catch((e) => logger.error?.(`[scheduler] ${key} failed: ${e.message}`))
        .finally(() => active.delete(key))
    }
  }

  const timer = setInterval(tick, intervalMs)
  timer.unref?.()
  setTimeout(tick, 2_000).unref?.()
  return () => {
    stopped = true
    clearInterval(timer)
  }
}
