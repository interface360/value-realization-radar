import { useSyncExternalStore } from 'react'
import { verifyWorkspace } from '../api/client.js'
import { DEFAULT_SERVER_URL, sessionStore } from './session.js'

// Workspace (tenant) switching for UI code.
export function useWorkspaceSession() {
  const session = useSyncExternalStore(sessionStore.subscribe, sessionStore.get)
  return {
    session,
    active: sessionStore.active(),
    defaultServerUrl: DEFAULT_SERVER_URL,
    async connect(serverUrl, apiKey) {
      const tenant = await verifyWorkspace(serverUrl, apiKey.trim())
      sessionStore.saveWorkspace({ serverUrl: serverUrl.replace(/\/+$/, ''), apiKey: apiKey.trim(), tenant })
      return tenant
    },
    activate: sessionStore.activate,
    forget: sessionStore.forget,
  }
}
