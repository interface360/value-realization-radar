import { createContext, useContext } from 'react'

export const DataContext = createContext(null)

export function useDataContext() {
  const ctx = useContext(DataContext)
  if (!ctx) throw new Error('useDataContext must be used inside <DataProvider>')
  return ctx
}

// Module-level handle so the plain action functions exported from '@core'
// (startIntervention, logBlocker, …) write to the active backend.
let active = null
export const setActiveProvider = (p) => {
  if (p) active = p
}
export const activeProvider = () => {
  if (!active) throw new Error('No data provider is active')
  return active
}
