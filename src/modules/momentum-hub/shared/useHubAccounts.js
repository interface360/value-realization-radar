import { useMemo } from 'react'
import { startIntervention, usePortfolio } from '@core'

// Shared by every version of this module. Versions differ in layout, not data.
export const HUB_ACTIONS = [
  { type: 'FDE Deploy', label: 'Deploy FDE/Builder', compactLabel: 'Deploy FDE', tone: 'primary' },
  { type: 'Recovery Plan', label: 'Initiate Recovery Plan', compactLabel: 'Recovery', tone: 'warning' },
]

export function useHubAccounts({ includeDelayed }) {
  const { accounts, loading } = usePortfolio()
  const pulled = useMemo(
    () =>
      accounts
        .filter((a) => a.status === 'Stalled' || (includeDelayed && a.status === 'Delayed') || a.hasActiveIntervention)
        .sort((a, b) => a.daysToRenewal - b.daysToRenewal),
    [accounts, includeDelayed],
  )
  return { accounts: pulled, loading }
}

export function runHubAction(account, type) {
  return startIntervention(account.id, type, { source: 'momentum-hub' })
}

export const hasActive = (account, type) => account.activeInterventions.some((i) => i.type === type)
