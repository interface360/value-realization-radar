import { useMemo } from 'react'
import { CircleCheck } from 'lucide-react'
import { EmptyState, fmt, Panel, SectionHeader } from '@core'
import { AccountCard } from '../shared/AccountCard.jsx'
import { useHubAccounts } from '../shared/useHubAccounts.js'

// Grid order matches the axes: impact grows upward, urgency grows rightward.
const QUADRANTS = [
  { id: 'plan', title: 'Plan recovery', hint: 'Not urgent · high impact', accent: '#fbbf24' },
  { id: 'do-now', title: 'Act now', hint: 'Urgent · high impact', accent: '#f43f5e' },
  { id: 'watch', title: 'Monitor', hint: 'Not urgent · lower impact', accent: '#64748b' },
  { id: 'quick', title: 'Quick save', hint: 'Urgent · lower impact', accent: '#fbbf24' },
]

export default function PriorityMatrix({ options }) {
  const { accounts, loading } = useHubAccounts(options)
  const impactThreshold = options.impactArr * 1000

  const cells = useMemo(() => {
    const out = Object.fromEntries(QUADRANTS.map((q) => [q.id, []]))
    for (const a of accounts) {
      const urgent = a.daysToRenewal <= options.urgentDays
      const high = a.underusedArr >= impactThreshold
      out[urgent ? (high ? 'do-now' : 'quick') : high ? 'plan' : 'watch'].push(a)
    }
    for (const list of Object.values(out)) list.sort((a, b) => b.underusedArr - a.underusedArr)
    return out
  }, [accounts, options.urgentDays, impactThreshold])

  if (loading) return null

  return (
    <div className="flex flex-1 flex-col gap-4">
      <SectionHeader eyebrow="Tab 1 · Account momentum hub · priority matrix" title="Where should the next FDE go?">
        <p className="font-mono text-xs text-slate-500">
          urgent ≤ {options.urgentDays}d · high impact ≥ {fmt.money(impactThreshold)} underused
        </p>
      </SectionHeader>

      <div className="relative grid flex-1 gap-3 pl-6 md:grid-cols-2">
        <span className="absolute top-0 bottom-6 left-0 hidden rotate-180 text-center text-[10px] tracking-[0.25em] text-slate-500 uppercase [writing-mode:vertical-rl] md:block">
          Impact ↑
        </span>
        {QUADRANTS.map((q) => {
          const list = cells[q.id]
          return (
            <Panel key={q.id} className="flex min-h-[300px] flex-col" style={{ boxShadow: `inset 0 1px 0 0 ${q.accent}55` }}>
              <div className="flex items-center justify-between gap-2 px-4 py-3">
                <div>
                  <h3 className="text-sm font-medium text-slate-100">{q.title}</h3>
                  <p className="text-[11px] text-slate-500">{q.hint}</p>
                </div>
                <div className="text-right font-mono text-xs text-slate-400 tabular-nums">
                  <p>{list.length} accts</p>
                  <p>{fmt.money(list.reduce((s, a) => s + a.underusedArr, 0))} idle</p>
                </div>
              </div>
              <div className="grid flex-1 content-start gap-2 overflow-y-auto px-3 pb-3 xl:max-h-[440px] xl:grid-cols-2">
                {list.length ? list.map((a) => <AccountCard key={a.id} account={a} compact />) : <EmptyState icon={CircleCheck} title="Nothing here" />}
              </div>
            </Panel>
          )
        })}
        <span className="col-span-full hidden text-right text-[10px] tracking-[0.25em] text-slate-500 uppercase md:block">Urgency (renewal proximity) →</span>
      </div>
    </div>
  )
}
