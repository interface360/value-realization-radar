import { createContext, useContext } from 'react'

// Cross-module UI state. Modules never import each other; they coordinate
// through this context (e.g. any module can ask to open an account, and the
// overlay module that handles it — the Intervention Drawer — reacts).
export const WorkspaceContext = createContext(null)

export function useWorkspace() {
  const ctx = useContext(WorkspaceContext)
  if (!ctx) throw new Error('useWorkspace must be used inside the app shell')
  return ctx
}
