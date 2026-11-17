import { Check } from 'lucide-react'
import { ActionButton, BlockerTag, cx, fmt, INTERVENTIONS, RatioBar, STATUS, StatusPill, THRESHOLDS, useWorkspace } from '@core'
import { hasActive, HUB_ACTIONS, runHubAction } from './useHubAccounts.js'

export function AccountCard({ account, compact = false }) {
  const { openAccount } = useWorkspace()
  const s = STATUS[account.status]

  return (
    <article
      className={cx(
        'group relative rounded-xl bg-slate-900/80 p-3 ring-1 transition hover:bg-slate-900',
        account.hasActiveIntervention ? 'ring-cyan-400/30 shadow-[0_0_24px_-10px] shadow-cyan-400/60' : 'ring-white/5 hover:ring-white/10',
      )}
    >
      <button type="button" onClick={() => openAccount(account.id)} className="block w-full text-left">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-slate-100 group-hover:text-white">{account.name}</p>
            <p className="truncate text-[11px] text-slate-500">{account.sponsor_name}</p>
          </div>
          <StatusPill status={account.status} />
        </div>

        <div className="mt-3 grid grid-cols-3 gap-2 font-mono text-xs tabular-nums">
          <div>
            <p className="font-sans text-[10px] text-slate-500 uppercase">ARR</p>
            <p className="text-slate-100">{fmt.money(account.arr_value)}</p>
          </div>
          <div>
            <p className="font-sans text-[10px] text-slate-500 uppercase">Renews</p>
            <p className={account.daysToRenewal < THRESHOLDS.renewalWindowDays ? 'text-amber-300' : 'text-slate-100'}>{fmt.days(account.daysToRenewal)}</p>
          </div>
          <div>
            <p className="font-sans text-[10px] text-slate-500 uppercase">Realized</p>
            <p className="text-slate-100">{fmt.pct(account.realization)}</p>
          </div>
        </div>
        <RatioBar value={account.realization} color={s.color} threshold={THRESHOLDS.lowRealization} className="mt-2" />

        {!compact && account.blockers.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {account.blockers.map((b) => (
              <BlockerTag key={b} type={b} />
            ))}
          </div>
        )}
      </button>

      <div className={cx('mt-3 grid gap-1.5', compact ? 'grid-cols-2' : 'grid-cols-1 sm:grid-cols-2')}>
        {HUB_ACTIONS.map((action) => {
          const active = hasActive(account, action.type)
          const Icon = active ? Check : INTERVENTIONS[action.type].icon
          return (
            <ActionButton
              key={action.type}
              size="sm"
              tone={action.tone}
              icon={Icon}
              active={active}
              disabled={active}
              onClick={() => runHubAction(account, action.type)}
            >
              {active ? INTERVENTIONS[action.type].short : compact ? action.compactLabel : action.label}
            </ActionButton>
          )
        })}
      </div>
    </article>
  )
}
