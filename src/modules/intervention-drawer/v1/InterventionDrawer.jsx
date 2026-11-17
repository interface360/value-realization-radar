import { useEffect, useState } from 'react'
import { Check, Plug, Rocket, Users, X } from 'lucide-react'
import {
  ActionButton,
  BLOCKER_ORDER,
  BLOCKERS,
  clearBlocker,
  cx,
  fmt,
  INTERVENTIONS,
  logBlocker,
  Metric,
  RatioBar,
  resolveIntervention,
  Sparkline,
  startIntervention,
  STATUS,
  StatusPill,
  THRESHOLDS,
  useActivity,
  usePortfolio,
  useWorkspace,
} from '@core'

function Section({ title, children, className }) {
  return (
    <section className={cx('border-t border-white/5 px-5 py-4', className)}>
      <p className="mb-3 font-mono text-[10px] tracking-[0.25em] text-slate-500 uppercase">{title}</p>
      {children}
    </section>
  )
}

function Diagnosis({ account }) {
  const s = STATUS[account.status]
  const worst = account.projects.find((p) => p.status === account.status) ?? account.projects[0]
  return (
    <div className="space-y-3">
      <div className="rounded-xl p-3 ring-1" style={{ backgroundColor: `${s.color}10`, boxShadow: `inset 0 0 0 1px ${s.color}30` }}>
        <p className="font-mono text-sm text-slate-100">
          Underused Capacity: <span style={{ color: s.color }}>{fmt.money(account.underusedArr)}</span>
          <span className="text-slate-500"> | </span>
          Project: <span style={{ color: s.color }}>{account.status}</span>
        </p>
        {worst && account.status !== 'On Track' && (
          <p className="mt-1 text-xs text-slate-400">
            {worst.name} {account.status === 'Stalled' ? 'has stalled' : 'is behind'}
            {worst.blocker_type !== 'None' && <> on {BLOCKERS[worst.blocker_type].label}</>}.
          </p>
        )}
      </div>
      <div className="grid grid-cols-3 gap-3">
        <Metric label="Realized" value={fmt.pct(account.realization, 1)} />
        <Metric label="Renews" value={fmt.days(account.daysToRenewal)} sub={account.renewal_date} />
        <Metric label="Last active" value={fmt.relativeTime(account.telemetry.last_active_date)} sub={account.telemetry.last_active_date} />
      </div>
      <RatioBar value={account.realization} color={s.color} threshold={THRESHOLDS.lowRealization} />
    </div>
  )
}

function Projects({ account }) {
  return (
    <ul className="space-y-2">
      {account.projects.map((p) => (
        <li key={p.id} className="flex items-center justify-between gap-2 rounded-lg bg-white/[0.03] px-3 py-2">
          <div className="min-w-0">
            <p className="truncate text-sm text-slate-200">{p.name}</p>
            {p.blocker_type !== 'None' && <p className="text-[11px] text-slate-500">Blocked: {BLOCKERS[p.blocker_type].label}</p>}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <StatusPill status={p.status} />
            {p.blocker_type !== 'None' && (
              <button type="button" onClick={() => clearBlocker(p.id)} className="text-[11px] text-slate-500 underline-offset-2 hover:text-emerald-300 hover:underline">
                Unblock
              </button>
            )}
          </div>
        </li>
      ))}
    </ul>
  )
}

function LogBlockerForm({ account, onDone }) {
  const [projectId, setProjectId] = useState(account.projects[0]?.id ?? '')
  const [type, setType] = useState(BLOCKER_ORDER[0])
  return (
    <div className="mt-3 space-y-3 rounded-xl bg-white/[0.03] p-3 ring-1 ring-white/5">
      <label className="block text-xs text-slate-400">
        Project
        <select value={projectId} onChange={(e) => setProjectId(e.target.value)} className="mt-1 w-full rounded-md bg-slate-800 px-2 py-1.5 text-sm text-slate-200 ring-1 ring-white/10 outline-none">
          {account.projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} · {p.status}
            </option>
          ))}
        </select>
      </label>
      <div className="grid grid-cols-3 gap-1.5">
        {BLOCKER_ORDER.map((b) => {
          const Icon = BLOCKERS[b].icon
          return (
            <button
              key={b}
              type="button"
              onClick={() => setType(b)}
              className={cx('flex flex-col items-center gap-1 rounded-lg px-2 py-2 text-[11px] ring-1 transition', type === b ? 'bg-amber-400/15 text-amber-100 ring-amber-400/40' : 'text-slate-400 ring-white/10 hover:text-slate-200')}
            >
              <Icon className="size-4" />
              {BLOCKERS[b].short}
            </button>
          )
        })}
      </div>
      <div className="flex gap-2">
        <ActionButton size="sm" tone="warning" className="flex-1" onClick={() => logBlocker(projectId, type).then(onDone)} disabled={!projectId}>
          Log {BLOCKERS[type].short} blocker
        </ActionButton>
        <ActionButton size="sm" tone="ghost" onClick={onDone}>
          Cancel
        </ActionButton>
      </div>
    </div>
  )
}

function Strategy({ account, onExecuted }) {
  const [blockerOpen, setBlockerOpen] = useState(false)
  const active = (type) => account.activeInterventions.some((i) => i.type === type)
  const run = (type) => startIntervention(account.id, type, { source: 'intervention-drawer' }).then(onExecuted)

  return (
    <div>
      <div className="grid grid-cols-3 gap-2">
        <ActionButton tone="ghost" icon={active('Align CS') ? Check : Users} active={active('Align CS')} disabled={active('Align CS')} onClick={() => run('Align CS')} className="flex-col !gap-1 py-3">
          Align CS
        </ActionButton>
        <ActionButton tone="primary" icon={active('FDE Deploy') ? Check : Rocket} active={active('FDE Deploy')} disabled={active('FDE Deploy')} onClick={() => run('FDE Deploy')} className="flex-col !gap-1 py-3">
          Deploy FDE
        </ActionButton>
        <ActionButton tone="warning" icon={Plug} onClick={() => setBlockerOpen((o) => !o)} disabled={!account.projects.length} className="flex-col !gap-1 py-3">
          Log Blocker
        </ActionButton>
      </div>
      {blockerOpen && (
        <LogBlockerForm
          account={account}
          onDone={() => {
            setBlockerOpen(false)
            onExecuted()
          }}
        />
      )}

      {account.activeInterventions.length > 0 && (
        <ul className="mt-4 space-y-1.5">
          {account.activeInterventions.map((i) => {
            const Icon = INTERVENTIONS[i.type]?.icon
            return (
              <li key={i.id} className="flex items-center justify-between gap-2 rounded-lg bg-cyan-400/5 px-3 py-2 text-xs ring-1 ring-cyan-400/20">
                <span className="flex items-center gap-2 text-cyan-100">
                  <span className="relative flex size-2">
                    <span className="absolute inset-0 animate-ping rounded-full bg-cyan-400/60" />
                    <span className="relative size-2 rounded-full bg-cyan-400" />
                  </span>
                  {Icon && <Icon className="size-3.5" />}
                  {i.type}
                  <span className="text-slate-500">· {fmt.relativeTime(i.created_at)}</span>
                </span>
                <button type="button" onClick={() => resolveIntervention(i.id)} className="text-slate-500 hover:text-emerald-300">
                  Mark resolved
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

function Activity({ accountId }) {
  const rows = useActivity(accountId)
  if (!rows.length) return <p className="text-xs text-slate-500">No activity yet.</p>
  return (
    <ol className="space-y-2 border-l border-white/10 pl-3">
      {rows.map((r) => (
        <li key={r.id} className="relative text-xs">
          <span className="absolute top-1.5 -left-[15.5px] size-1.5 rounded-full bg-slate-500" />
          <span className="text-slate-300">{r.message}</span>
          <span className="ml-2 font-mono text-[10px] text-slate-500">{fmt.relativeTime(r.at)}</span>
        </li>
      ))}
    </ol>
  )
}

export default function InterventionDrawer({ options }) {
  const { selectedAccountId, closeAccount } = useWorkspace()
  const { accounts } = usePortfolio()
  const account = accounts.find((a) => a.id === selectedAccountId)

  useEffect(() => {
    if (!selectedAccountId) return
    const onKey = (e) => e.key === 'Escape' && closeAccount()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selectedAccountId, closeAccount])

  if (!account) return null
  const s = STATUS[account.status]

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <button type="button" aria-label="Close drawer" onClick={closeAccount} className="absolute inset-0 bg-slate-950/40 backdrop-blur-[2px]" />
      <aside
        key={account.id}
        role="dialog"
        aria-label={`${account.name} intervention drawer`}
        className="animate-drawer-in relative flex h-full w-full max-w-[440px] flex-col overflow-y-auto border-l border-white/10 bg-slate-900/55 shadow-[-24px_0_80px_-20px_rgba(0,0,0,0.8)] backdrop-blur-2xl"
      >
        <div className="pointer-events-none absolute inset-x-0 top-0 h-48" style={{ background: `radial-gradient(ellipse at top right, ${s.color}22, transparent 70%)` }} />

        {/* Top: identity + usage sparkline */}
        <header className="relative px-5 pt-5 pb-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <StatusPill status={account.status} size="md" />
              <h2 className="mt-2 truncate text-xl font-semibold text-slate-50">{account.name}</h2>
              <p className="text-sm text-slate-400">
                Sponsor · <span className="text-slate-200">{account.sponsor_name}</span>
              </p>
            </div>
            <button type="button" onClick={closeAccount} aria-label="Close" className="rounded-lg p-1.5 text-slate-400 hover:bg-white/10 hover:text-slate-100">
              <X className="size-5" />
            </button>
          </div>

          <div className="mt-4 flex items-end justify-between gap-4">
            <div>
              <p className="font-mono text-2xl text-slate-50 tabular-nums">{fmt.money(account.arr_value, { precise: true })}</p>
              <p className="text-[11px] text-slate-500">ARR</p>
            </div>
            <div className="text-right">
              <Sparkline values={account.history} color={s.color} width={170} height={44} />
              <p className="text-[11px] text-slate-500">
                12-wk usage
                {account.dropOff > 0.05 && <span className="ml-1 font-mono" style={{ color: s.color }}>↓ {fmt.pct(account.dropOff)} from peak</span>}
              </p>
            </div>
          </div>
        </header>

        {/* Middle: diagnosis */}
        <Section title="Diagnosis">
          <Diagnosis account={account} />
        </Section>

        <Section title={`Projects · ${account.projects.length}`}>
          <Projects account={account} />
        </Section>

        {/* Bottom: execute strategy */}
        <Section title="Execute strategy" className="bg-white/[0.02]">
          <Strategy account={account} onExecuted={() => options.closeOnAction && closeAccount()} />
        </Section>

        {options.showActivity && (
          <Section title="Activity">
            <Activity accountId={account.id} />
          </Section>
        )}
      </aside>
    </div>
  )
}
