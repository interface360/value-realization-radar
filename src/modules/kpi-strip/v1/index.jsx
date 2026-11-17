import { Activity, DollarSign, Gauge, Rocket, Timer } from 'lucide-react'
import { fmt, STATUS, THRESHOLDS, usePortfolio } from '@core'

function Tile({ icon: Icon, label, value, sub, color, glow }) {
  return (
    <div className="relative flex min-w-0 items-center gap-3 overflow-hidden rounded-2xl bg-slate-900/60 px-4 py-3 ring-1 ring-white/5">
      {glow && <div className="pointer-events-none absolute -top-8 -right-8 size-24 rounded-full blur-2xl" style={{ backgroundColor: `${color}26` }} />}
      <Icon className="size-4 shrink-0" style={{ color: color ?? '#64748b' }} />
      <div className="min-w-0">
        <p className="truncate text-[11px] tracking-wide text-slate-500 uppercase">{label}</p>
        <p className="font-mono text-xl text-slate-50 tabular-nums">{value}</p>
        {sub && <p className="truncate text-[11px] text-slate-500">{sub}</p>}
      </div>
    </div>
  )
}

export default function KpiStrip({ options }) {
  const { summary } = usePortfolio()
  if (!summary) return <div className="h-[86px]" />

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
      <Tile icon={DollarSign} label="Portfolio ARR" value={fmt.money(summary.totalArr)} sub={`${summary.count} accounts`} />
      <Tile
        icon={Activity}
        label="ARR at risk"
        value={fmt.money(summary.atRiskArr)}
        sub={`${summary.atRiskCount} delayed or stalled · ${fmt.pct(summary.totalArr ? summary.atRiskArr / summary.totalArr : 0)}`}
        color={STATUS.Stalled.color}
        glow
      />
      <Tile icon={Gauge} label="Value realization" value={fmt.pct(summary.realization)} sub="consumed / purchased capacity" color={STATUS['On Track'].color} />
      <Tile icon={Rocket} label="Active interventions" value={summary.activeInterventions} sub="FDE, recovery, packaging" color="#22d3ee" />
      {options.showDanger && (
        <Tile
          icon={Timer}
          label="Renewal danger"
          value={summary.dangerCount}
          sub={`< ${THRESHOLDS.renewalWindowDays}d & < ${fmt.pct(THRESHOLDS.lowRealization)} realized`}
          color={STATUS.Delayed.color}
          glow={summary.dangerCount > 0}
        />
      )}
    </div>
  )
}
