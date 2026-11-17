import { createApiClient } from '../../api/client.js'

// Server-backed data provider for one tenant workspace. Keeps an in-memory
// snapshot, notifies subscribers on change and refreshes after every write,
// on window focus and on a light poll (picks up scheduled syncs).

const POLL_MS = 30_000

export function createServerProvider(workspace) {
  const api = createApiClient(workspace)
  let snapshot = null
  let error = null
  let version = 0
  const listeners = new Set()
  const notify = () => {
    version++
    for (const l of listeners) l()
  }

  let inflight = null
  async function refresh() {
    inflight ??= api.portfolio
      .snapshot()
      .then((s) => {
        snapshot = s
        error = null
      })
      .catch((e) => {
        error = e
      })
      .finally(() => {
        inflight = null
        notify()
      })
    return inflight
  }

  let timer = null
  const onFocus = () => refresh()
  function start() {
    if (timer) return
    timer = setInterval(refresh, POLL_MS)
    window.addEventListener('focus', onFocus)
    refresh()
  }
  function stop() {
    clearInterval(timer)
    timer = null
    window.removeEventListener('focus', onFocus)
  }

  const after = (p) => p.then((r) => (refresh(), r))

  return {
    kind: 'server',
    workspace,
    api,
    subscribe(fn) {
      listeners.add(fn)
      if (listeners.size === 1) start()
      return () => {
        listeners.delete(fn)
        if (!listeners.size) stop()
      }
    },
    getSnapshot: () => snapshot,
    getError: () => error,
    getVersion: () => version,
    refresh,
    activity: (accountId, limit) => api.portfolio.activity(accountId, limit),
    actions: {
      startIntervention: (accountId, type, details) => after(api.portfolio.startIntervention(accountId, type, details)),
      resolveIntervention: (id) => after(api.portfolio.resolveIntervention(id)),
      logBlocker: (projectId, type) => after(api.portfolio.setBlocker(projectId, type)),
      clearBlocker: (projectId) => after(api.portfolio.setBlocker(projectId, 'None')),
      resetDatabase: () => after(api.portfolio.resetAppData()),
    },
  }
}
