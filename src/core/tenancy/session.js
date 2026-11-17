import { APP_CONFIG } from '@config/app.config.js'

// Which backend the dashboard reads from, persisted per browser.
//   { mode: 'local' }                                       → embedded IndexedDB demo
//   { mode: 'server', serverUrl, apiKey, tenant }           → a tenant on the sync server
// Several server workspaces can be saved; one is active.

const KEY = 'vrr.session.v1'
const listeners = new Set()

const DEFAULT = { active: 'local', workspaces: [] }

function read() {
  try {
    return { ...DEFAULT, ...JSON.parse(localStorage.getItem(KEY)) }
  } catch {
    return DEFAULT
  }
}

let state = read()

function write(next) {
  state = next
  localStorage.setItem(KEY, JSON.stringify(next))
  for (const l of listeners) l(state)
}

export const sessionStore = {
  get: () => state,
  subscribe(fn) {
    listeners.add(fn)
    return () => listeners.delete(fn)
  },
  active() {
    if (state.active === 'local') return { mode: 'local' }
    const ws = state.workspaces.find((w) => w.tenant.id === state.active)
    return ws ? { mode: 'server', ...ws } : { mode: 'local' }
  },
  saveWorkspace({ serverUrl, apiKey, tenant }) {
    const others = state.workspaces.filter((w) => w.tenant.id !== tenant.id)
    write({ active: tenant.id, workspaces: [...others, { serverUrl, apiKey, tenant }] })
  },
  activate(id) {
    if (id === 'local' || state.workspaces.some((w) => w.tenant.id === id)) write({ ...state, active: id })
  },
  forget(id) {
    write({ active: state.active === id ? 'local' : state.active, workspaces: state.workspaces.filter((w) => w.tenant.id !== id) })
  },
}

export const DEFAULT_SERVER_URL = APP_CONFIG.syncServerUrl
