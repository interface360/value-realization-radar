import { useMemo, useState } from 'react'
import { Check, Package, ShieldCheck } from 'lucide-react'
import { ActionButton, EmptyState, fmt, Panel, SectionHeader, STATUS, StatusPill, startIntervention, usePortfolio, useWorkspace } from '@core'
import { defaultAssistedPace, monthsToTarget, observedPace, project } from './model.js'

function Slider({ label, value, min, max, step = 1, unit, onChange, hint }) {
  return (
    <label className="block min-w-0">
      <span className="flex items-baseline justify-between gap-2 text-[11px] text-slate-400">
        <span className="truncate">{label}</span>
        <span className="font-mono text-slate-100 tabular-nums">
          {value}
          {unit}
        </span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-1 w-full accent-cyan-400"
      />
      {hint && <span className="block truncate text-[10px] text-slate-500">{hint}</span>}
    </label>
  )
}

// Horizontal runway: today → renewal (solid), renewal → extended end (cyan).
// The realization line underneath shows where adoption lands at each end date.
function Runway({ account, plan, scaleDays, target }) {
  const p = project(account, plan)
  const pos = (d) => `${Math.min(100, (d / scaleDays) * 100)}%`
  const statusColor = STATUS[account.status].color
  const reaches = p.atExtended >= target
  const endColor = reaches ? STATUS['On Track'].color : STATUS.Delayed.color

  return (
    <div className="space-y-2">
      <div className="relative mt-3 h-7">
        <div className="absolute inset-y-2.5 right-0 left-0 rounded-full bg-white/[0.03]" />
        <div className="absolute inset-y-2 left-0 rounded-l-full" style={{ width: pos(p.runwayDays), backgroundColor: `${statusColor}55`, boxShadow: `0 0 12px -2px ${statusColor}` }} />
        {plan.extensionMonths > 0 && (
          <div
            className="absolute inset-y-2 rounded-r-full transition-all duration-300"
            style={{
              left: `calc(${pos(p.runwayDays)} + 2px)`,
              width: `calc(${pos(p.extendedDays - p.runwayDays)} - 2px)`,
              backgroundImage: 'repeating-linear-gradient(135deg, rgba(34,211,238,0.35) 0 4px, rgba(34,211,238,0.15) 4px 8px)',
              boxShadow: '0 0 14px -4px #22d3ee',
            }}
          />
        )}
        <div className="absolute inset-y-0 w-0.5 rounded bg-slate-100" style={{ left: pos(p.runwayDays) }} title="Current renewal date" />
        <span className="absolute -top-3.5 -translate-x-1/2 font-mono text-[10px] whitespace-nowrap text-slate-300" style={{ left: pos(p.runwayDays) }}>
          {fmt.days(p.runwayDays)}
        </span>
        {plan.extensionMonths > 0 && (
          <span className="absolute -top-3.5 -translate-x-full font-mono text-[10px] whitespace-nowrap text-cyan-300" style={{ left: pos(p.extendedDays) }}>
            +{plan.extensionMonths}mo
          </span>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-x-5 gap-y-1 font-mono text-xs tabular-nums">
        <span className="text-slate-500">
          now <span className="text-slate-200">{fmt.pct(account.realization)}</span>
        </span>
        <span className="text-slate-500">
          at renewal <span className="text-slate-200">{fmt.pct(p.atRenewal)}</span>
        </span>
        <span className="text-slate-500">
          at new end <span style={{ color: endColor }}>{fmt.pct(p.atExtended)}</span>
        </span>
        <span className="inline-flex items-center gap-1" style={{ color: endColor }}>
          {reaches ? <ShieldCheck className="size-3.5" /> : <Package className="size-3.5" />}
          {reaches ? `clears ${fmt.pct(target)} target` : `short of ${fmt.pct(target)} target`}
        </span>
      </div>
    </div>
  )
}

function AccountRow({ account, options, scaleDays }) {
  const { openAccount } = useWorkspace()
  const target = options.targetRealization / 100
  const applied = account.activeInterventions.find((i) => i.type === 'Packaging')
  const [plan, setPlan] = useState(() => ({
    extensionMonths: applied?.details?.extensionMonths ?? Math.min(6, options.maxExtensionMonths),
    pacePerWeek: applied?.details?.pacePerWeek ?? defaultAssistedPace(account),
  }))
  const p = project(account, plan)
  const needed = monthsToTarget(account, plan.pacePerWeek, target)
  const isApplied = applied && applied.details?.extensionMonths === plan.extensionMonths && applied.details?.pacePerWeek === plan.pacePerWeek

  return (
    <li className="grid gap-4 rounded-xl bg-slate-900/80 p-4 ring-1 ring-white/5 lg:grid-cols-[minmax(180px,1fr)_minmax(320px,2.2fr)_minmax(220px,1fr)]">
      <button type="button" onClick={() => openAccount(account.id)} className="min-w-0 text-left">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm font-medium text-slate-100 hover:text-white">{account.name}</p>
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <StatusPill status={account.status} />
          <span className="font-mono text-xs text-slate-300 tabular-nums">{fmt.money(account.arr_value)}</span>
        </div>
        <p className="mt-1 truncate text-[11px] text-slate-500">
          Underused {fmt.money(account.underusedArr)} · pace {observedPace(account).toFixed(1)}pp/wk
        </p>
      </button>

      <Runway account={account} plan={plan} scaleDays={scaleDays} target={target} />

      <div className="space-y-2">
        <div className="grid grid-cols-2 gap-3">
          <Slider
            label="Term extension"
            value={plan.extensionMonths}
            min={0}
            max={options.maxExtensionMonths}
            unit="mo"
            onChange={(extensionMonths) => setPlan((s) => ({ ...s, extensionMonths }))}
            hint={needed == null ? 'target unreachable' : needed === 0 ? 'no extension needed' : `${needed}mo reaches target`}
          />
          <Slider
            label="Assisted pace"
            value={plan.pacePerWeek}
            min={0}
            max={8}
            step={0.5}
            unit="pp/wk"
            onChange={(pacePerWeek) => setPlan((s) => ({ ...s, pacePerWeek }))}
            hint={`ARR/yr → ${fmt.money(p.annualisedArr)}`}
          />
        </div>
        <ActionButton
          size="sm"
          icon={isApplied ? Check : Package}
          active={isApplied}
          disabled={isApplied}
          className="w-full"
          onClick={() => startIntervention(account.id, 'Packaging', { ...plan, projected: p.atExtended, source: 'commercial-flexibility' })}
        >
          {isApplied ? 'Packaging proposal active' : applied ? 'Update packaging proposal' : 'Apply flexible packaging'}
        </ActionButton>
      </div>
    </li>
  )
}

export default function CommercialFlexibility({ options }) {
  const { accounts, loading } = usePortfolio()
  const maxReal = options.maxRealization / 100

  const eligible = useMemo(
    () =>
      accounts
        .filter((a) => a.daysToRenewal >= 0 && a.daysToRenewal < options.windowDays && a.realization < maxReal)
        .sort((a, b) => a.daysToRenewal - b.daysToRenewal),
    [accounts, options.windowDays, maxReal],
  )
  // Shared time scale so runways are comparable across rows.
  const scaleDays = options.windowDays + options.maxExtensionMonths * 30.4
  const arrInPlay = eligible.reduce((s, a) => s + a.arr_value, 0)

  if (loading) return null

  return (
    <div className="flex flex-1 flex-col gap-4">
      <SectionHeader eyebrow="Tab 3 · Commercial flexibility · safety net" title="Buy adoption time instead of forcing churn">
        <div className="flex items-center gap-6 font-mono text-xs text-slate-400 tabular-nums">
          <span>
            <span className="text-2xl text-amber-300">{eligible.length}</span> renewals
          </span>
          <span>
            <span className="text-2xl text-slate-100">{fmt.money(arrInPlay)}</span> ARR in play
          </span>
        </div>
      </SectionHeader>

      <Panel className="flex-1 p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500">
          <p>
            Renewing in &lt; {options.windowDays}d with &lt; {options.maxRealization}% value realized. Bars show runway to renewal, plus any modelled extension (striped).
          </p>
          <span className="inline-flex items-center gap-3">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2 w-5 rounded-full bg-rose-400/50" /> runway
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2 w-5 rounded-full bg-[repeating-linear-gradient(135deg,rgba(34,211,238,0.5)_0_3px,rgba(34,211,238,0.2)_3px_6px)]" /> extension
            </span>
          </span>
        </div>
        {eligible.length ? (
          <ul className="space-y-2">
            {eligible.map((a) => (
              <AccountRow key={a.id} account={a} options={options} scaleDays={scaleDays} />
            ))}
          </ul>
        ) : (
          <EmptyState icon={ShieldCheck} title="No renewals need a safety net">
            Nothing renews within {options.windowDays} days below {options.maxRealization}% realization.
          </EmptyState>
        )}
      </Panel>
    </div>
  )
}
