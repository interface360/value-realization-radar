import { useEffect, useMemo, useSyncExternalStore } from 'react'
import { sessionStore } from '../tenancy/session.js'
import { DataContext, setActiveProvider } from './context.js'
import { createLocalProvider } from './providers/local.js'
import { createServerProvider } from './providers/server.js'

// Chooses the data backend for the active workspace and exposes it via context.
export function DataProvider({ children }) {
  const session = useSyncExternalStore(sessionStore.subscribe, sessionStore.get)
  const workspace = sessionStore.active()
  const key = workspace.mode === 'local' ? 'local' : `${workspace.tenant.id}@${workspace.serverUrl}`

  // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` captures the workspace identity
  const provider = useMemo(() => (workspace.mode === 'local' ? createLocalProvider() : createServerProvider(workspace)), [key])
  setActiveProvider(provider)

  useEffect(() => () => setActiveProvider(null), [provider])

  const value = useMemo(() => ({ provider, workspace, session }), [provider, workspace, session])
  return <DataContext.Provider value={value}>{children}</DataContext.Provider>
}
