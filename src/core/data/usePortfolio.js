import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { deriveAccounts, portfolioSummary } from '../metrics/derive.js'
import { activeProvider, useDataContext } from './context.js'

// Live view of the whole portfolio from the active backend (local demo DB or
// the tenant's sync server). Any write re-renders every subscriber — this is
// what makes drawer/hub actions show up on the radar instantly.
export function usePortfolio() {
  const { provider } = useDataContext()
  const raw = useSyncExternalStore(provider.subscribe, provider.getSnapshot)
  const error = provider.getError()

  return useMemo(() => {
    if (!raw) return { loading: !error, error, accounts: [], summary: null }
    const accounts = deriveAccounts(raw)
    return { loading: false, error, accounts, summary: portfolioSummary(accounts) }
  }, [raw, error])
}

export function useActivity(accountId, limit = 6) {
  const { provider } = useDataContext()
  const version = useSyncExternalStore(provider.subscribe, provider.getVersion)
  const [rows, setRows] = useState([])
  useEffect(() => {
    let cancelled = false
    provider
      .activity(accountId, limit)
      .then((r) => !cancelled && setRows(r))
      .catch(() => !cancelled && setRows([]))
    return () => {
      cancelled = true
    }
  }, [provider, accountId, limit, version])
  return rows
}

// Backend-agnostic write actions (same names/signatures as before).
export const startIntervention = (...a) => activeProvider().actions.startIntervention(...a)
export const resolveIntervention = (...a) => activeProvider().actions.resolveIntervention(...a)
export const logBlocker = (...a) => activeProvider().actions.logBlocker(...a)
export const clearBlocker = (...a) => activeProvider().actions.clearBlocker(...a)
export const resetDatabase = (...a) => activeProvider().actions.resetDatabase(...a)
