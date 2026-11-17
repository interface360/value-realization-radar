import { useMemo } from 'react'
import { CircleCheck, Rocket } from 'lucide-react'
import { EmptyState, fmt, Panel, SectionHeader, STATUS } from '@core'
import { AccountCard } from '../shared/AccountCard.jsx'
import { useHubAccounts } from '../shared/useHubAccounts.js'

const SORTERS = {
  renewal: (a, b) => a.daysToRenewal - b.daysToRenewal,
  arr: (a, b) => b.arr_value - a.arr_value,
  realization: (a, b) => a.realization - b.realization,
}

export default function AccountMomentumHub({ options }) {
  const { accounts, loading } = useHubAccounts(options)

  const columns = useMemo(() => {
    const sort = SORTERS[options.sortBy] ?? SORTERS.renewal
    const cols = [
      { id: 'Stalled', title: 'Stalled', color: STATUS.Stalled.color, icon: STATUS.Stalled.icon, items: [] },
      ...(options.includeDelayed ? [{ id: 'Delayed', title: 'Delayed', color: STATUS.Delayed.color, icon: STATUS.Delayed.icon, items: [] }] : []),
      { id: 'active', title: 'Intervention Active', color: '#22d3ee', icon: Rocket, items: [] },
    ]
    const byId = Object.fromEntries(cols.map((c) => [c.id, c]))
    for (const a of accounts) (a.hasActiveIntervention ? byId.active : byId[a.status])?.items.push(a)
    for (const c of cols) c.items.sort(sort)
    return cols
  }, [accounts, options.includeDelayed, options.sortBy])

  if (loading) return null

  return (
    <div className="flex flex-1 flex-col gap-4">
      <SectionHeader eyebrow="Tab 1 · Account momentum hub" title="Get stalled value moving again">
        <p className="max-w-md text-xs text-slate-500">Red and amber accounts flow in from the radar. Deploying help moves them to Intervention Active and adds a pulsing ring on the radar.</p>
      </SectionHeader>

      <div className={`grid flex-1 gap-4 ${columns.length === 3 ? 'lg:grid-cols-3' : 'lg:grid-cols-2'}`}>
        {columns.map((col) => {
          const Icon = col.icon
          const arr = col.items.reduce((s, a) => s + a.arr_value, 0)
          return (
            <Panel key={col.id} className="flex min-h-[420px] flex-col">
              <div className="flex items-center justify-between gap-2 border-b border-white/5 px-4 py-3">
                <div className="flex items-center gap-2">
                  <Icon className="size-4" style={{ color: col.color, filter: `drop-shadow(0 0 6px ${col.color})` }} />
                  <h3 className="text-sm font-medium text-slate-100">{col.title}</h3>
                  <span className="rounded-full bg-white/5 px-1.5 font-mono text-[11px] text-slate-400">{col.items.length}</span>
                </div>
                <span className="font-mono text-xs text-slate-400 tabular-nums">{fmt.money(arr)}</span>
              </div>
              <div className="flex-1 space-y-2 overflow-y-auto p-3 lg:max-h-[640px]">
                {col.items.length ? (
                  col.items.map((a) => <AccountCard key={a.id} account={a} />)
                ) : (
                  <EmptyState icon={CircleCheck} title="Clear">
                    No accounts here right now.
                  </EmptyState>
                )}
              </div>
            </Panel>
          )
        })}
      </div>
    </div>
  )
}
