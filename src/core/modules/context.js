import { createContext, useContext } from 'react'

export const ModuleContext = createContext(null)

export function useModules() {
  const ctx = useContext(ModuleContext)
  if (!ctx) throw new Error('useModules must be used inside <ModuleProvider>')
  return ctx
}
