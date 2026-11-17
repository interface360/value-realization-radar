import * as d3 from 'd3'
import { useMemo, useState } from 'react'
import { Crosshair } from 'lucide-react'
import {
  EmptyState,
  fmt,
  HoverCard,
  HoverRow,
  INTERVENTIONS,
  Panel,
  STATUS,
  STATUS_ORDER,
  SURFACE,
  THRESHOLDS,
  useElementSize,
  usePortfolio,
  useWorkspace,
} from '@core'

const MARGIN = { top: 28, right: 36, bottom: 52, left: 64 }

function Legend({ hidden, onToggle, counts }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {STATUS_ORDER.map((key) => {
        const s = STATUS[key]
        const Icon = s.icon
        const off = hidden.has(key)
        return (
          <button
            key={key}
            type="button"
            aria-pressed={!off}
            onClick={() => onToggle(key)}
            className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs ring-1 transition"
            style={
              off
                ? { color: '#64748b', boxShadow: 'none' }
                : { color: '#e2e8f0', backgroundColor: `${s.color}14`, boxShadow: `inset 0 0 0 1px ${s.color}40` }
            }
          >
            <span className="size-2 rounded-full" style={{ backgroundColor: off ? '#334155' : s.color, boxShadow: off ? 'none' : `0 0 6px ${s.color}` }} />
            <Icon className="size-3" style={{ color: off ? '#475569' : s.color }} />
            {s.label}
            <span className="font-mono text-slate-500">{counts[key] ?? 0}</span>
          </button>
        )
      })}
      <span className="ml-1 inline-flex items-center gap-1.5 text-xs text-slate-400">
        <svg width="18" height="18" aria-hidden="true">
          <circle cx="9" cy="9" r="5" fill="none" stroke="#22d3ee" strokeWidth="1.5" />
          <circle cx="9" cy="9" r="8" fill="none" stroke="#22d3ee" strokeOpacity="0.4" strokeWidth="1" />
        </svg>
        Intervention active
      </span>
      <span className="inline-flex items-center gap-1.5 text-xs text-slate-400">
        <svg width="26" height="18" aria-hidden="true">
          <circle cx="5" cy="12" r="3" fill="none" stroke="#64748b" />
          <circle cx="17" cy="9" r="7" fill="none" stroke="#64748b" />
        </svg>
        Size = ARR
      </span>
    </div>
  )
}

function Tooltip({ account, x, y, bounds }) {
  const s = STATUS[account.status]
  const Icon = s.icon
  return (
    <HoverCard x={x} y={y} bounds={bounds}>
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-slate-50">{account.name}</p>
          <p className="truncate text-slate-500">Sponsor · {account.sponsor_name}</p>
        </div>
        <span className="inline-flex shrink-0 items-center gap-1 text-[11px]" style={{ color: s.color }}>
          <Icon className="size-3" />
          {s.label}
        </span>
      </div>
      <HoverRow label="ARR" value={fmt.money(account.arr_value, { precise: true })} />
      <HoverRow label="Value realization" value={fmt.pct(account.realization, 1)} />
      <HoverRow label="Capacity used" value={`${fmt.num(account.telemetry.consumed_capacity)} / ${fmt.num(account.telemetry.purchased_capacity)}`} />
      <HoverRow label="Renewal" value={`${fmt.days(account.daysToRenewal)} · ${account.renewal_date}`} />
      <HoverRow label="Underused ARR" value={fmt.money(account.underusedArr)} />
      <HoverRow label="Last active" value={account.telemetry.last_active_date} />
      {account.activeInterventions.length > 0 && (
        <p className="mt-2 border-t border-white/5 pt-2 text-cyan-200">
          {account.activeInterventions.map((i) => INTERVENTIONS[i.type]?.short ?? i.type).join(' · ')}
        </p>
      )}
      <p className="mt-2 text-[10px] tracking-wider text-slate-500 uppercase">Click to open intervention drawer</p>
    </HoverCard>
  )
}

export default function ValueRealizationRadar({ options }) {
  const { accounts, loading } = usePortfolio()
  const { openAccount, selectedAccountId } = useWorkspace()
  const [ref, { width, height }] = useElementSize()
  const [hover, setHover] = useState(null)
  const [hidden, setHidden] = useState(() => new Set())

  const horizon = options.horizonDays
  const innerW = Math.max(0, width - MARGIN.left - MARGIN.right)
  const innerH = Math.max(0, height - MARGIN.top - MARGIN.bottom)

  const scales = useMemo(() => {
    const yMax = Math.max(1.1, d3.max(accounts, (a) => a.realization) ?? 1) + 0.05
    return {
      // Left = far away, right = imminent.
      x: d3.scaleLinear([horizon, 0], [0, innerW]).clamp(true),
      y: d3.scaleLinear([0, yMax], [innerH, 0]).nice(),
      r: d3.scaleSqrt([0, d3.max(accounts, (a) => a.arr_value) ?? 1], [4, options.maxBubble]),
    }
  }, [accounts, horizon, innerW, innerH, options.maxBubble])

  const counts = useMemo(() => d3.rollup(accounts, (v) => v.length, (a) => a.status), [accounts])

  // Paint big bubbles first so small ones stay clickable on top.
  const visible = useMemo(
    () => accounts.filter((a) => !hidden.has(a.status)).sort((a, b) => b.arr_value - a.arr_value),
    [accounts, hidden],
  )
  // Direct-label the top-N by ARR, skipping any label that would collide with one already placed.
  const labelled = useMemo(() => {
    const placed = []
    const ids = new Set()
    for (const a of visible) {
      if (ids.size >= options.labelTop) break
      const radius = scales.r(a.arr_value)
      const w = a.name.length * 6.4
      const cx = scales.x(a.daysToRenewal)
      const cy = scales.y(a.realization) - radius - (a.hasActiveIntervention ? 12 : 6)
      const box = { x0: cx - w / 2, x1: cx + w / 2, y0: cy - 12, y1: cy + 2 }
      if (placed.some((p) => box.x0 < p.x1 && box.x1 > p.x0 && box.y0 < p.y1 && box.y1 > p.y0)) continue
      placed.push(box)
      ids.add(a.id)
    }
    return ids
  }, [visible, options.labelTop, scales])

  const toggle = (key) =>
    setHidden((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })

  const { x, y, r } = scales
  const xTicks = x.ticks(Math.max(2, Math.floor(innerW / 110)))
  const yTicks = y.ticks(6)
  const windowX = x(THRESHOLDS.renewalWindowDays)
  const lowY = y(THRESHOLDS.lowRealization)
  const fullY = y(1)
  const ready = width > 0 && !loading

  return (
    <Panel className="flex flex-1 flex-col p-4 sm:p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-mono text-[10px] tracking-[0.25em] text-cyan-300/70 uppercase">Value realization radar</p>
          <p className="mt-1 text-sm text-slate-400">
            Accounts drift <span className="text-slate-200">right</span> as renewal approaches. Anything low and right is a renewal at risk.
          </p>
        </div>
        <Legend hidden={hidden} onToggle={toggle} counts={Object.fromEntries(counts)} />
      </div>

      <div ref={ref} className="relative min-h-[480px] flex-1" onMouseLeave={() => setHover(null)}>
        {ready && (
          <svg width={width} height={height} className="absolute inset-0 overflow-visible" role="img" aria-label="Bubble chart of accounts by renewal proximity and value realization">
            <defs>
              <filter id="radar-glow" x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation="6" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
              <radialGradient id="radar-sweep" cx="100%" cy="100%" r="100%">
                <stop offset="0%" stopColor="#22d3ee" stopOpacity="0.06" />
                <stop offset="100%" stopColor="#22d3ee" stopOpacity="0" />
              </radialGradient>
            </defs>

            <g transform={`translate(${MARGIN.left},${MARGIN.top})`}>
              <rect width={innerW} height={innerH} fill="url(#radar-sweep)" />

              {options.showDangerZone && (
                <g>
                  <rect x={windowX} y={lowY} width={innerW - windowX} height={innerH - lowY} fill={STATUS.Stalled.color} fillOpacity="0.07" />
                  <line x1={windowX} x2={windowX} y1={lowY} y2={innerH} stroke={STATUS.Stalled.color} strokeOpacity="0.35" />
                  <line x1={windowX} x2={innerW} y1={lowY} y2={lowY} stroke={STATUS.Stalled.color} strokeOpacity="0.35" />
                  <text x={innerW - 8} y={innerH - 10} textAnchor="end" className="fill-rose-300/70 font-mono text-[10px] tracking-[0.2em] uppercase">
                    Renewal danger zone
                  </text>
                </g>
              )}

              {/* Recessive grid */}
              {yTicks.map((t) => (
                <g key={`y${t}`}>
                  <line x1={0} x2={innerW} y1={y(t)} y2={y(t)} stroke="#ffffff" strokeOpacity={t === 0 ? 0.12 : 0.04} />
                  <text x={-12} y={y(t)} dy="0.32em" textAnchor="end" className="fill-slate-500 font-mono text-[11px]">
                    {fmt.pct(t)}
                  </text>
                </g>
              ))}
              {xTicks.map((t) => (
                <g key={`x${t}`}>
                  <line x1={x(t)} x2={x(t)} y1={0} y2={innerH} stroke="#ffffff" strokeOpacity="0.04" />
                  <text x={x(t)} y={innerH + 20} textAnchor="middle" className="fill-slate-500 font-mono text-[11px]">
                    {t === 0 ? 'now' : `${t}d`}
                  </text>
                </g>
              ))}
              <line x1={0} x2={innerW} y1={fullY} y2={fullY} stroke={STATUS['On Track'].color} strokeOpacity="0.25" />
              <text x={4} y={fullY - 6} className="fill-cyan-300/60 font-mono text-[10px]">
                100% of purchased capacity
              </text>

              {options.showQuadrants && (
                <g className="fill-slate-600 text-[10px] tracking-[0.2em] uppercase">
                  <text x={8} y={14}>Healthy runway</text>
                  <text x={innerW - 8} y={14} textAnchor="end">
                    Ready to renew
                  </text>
                  <text x={8} y={innerH - 10}>
                    Adoption runway
                  </text>
                </g>
              )}

              {/* Axis titles */}
              <text x={innerW / 2} y={innerH + 44} textAnchor="middle" className="fill-slate-400 text-xs">
                Time to renewal → imminent
              </text>
              <text transform={`translate(${-48},${innerH / 2}) rotate(-90)`} textAnchor="middle" className="fill-slate-400 text-xs">
                Value realization % (consumed / purchased)
              </text>

              {/* Bubbles */}
              {visible.map((a) => {
                const s = STATUS[a.status]
                const cx = x(a.daysToRenewal)
                const cy = y(a.realization)
                const radius = r(a.arr_value)
                const isHover = hover?.id === a.id
                const isSelected = selectedAccountId === a.id
                const dim = hover && !isHover
                return (
                  <g
                    key={a.id}
                    transform={`translate(${cx},${cy})`}
                    className="cursor-pointer outline-none"
                    style={{ opacity: dim ? 0.35 : 1, transition: 'opacity 150ms' }}
                    tabIndex={0}
                    role="button"
                    aria-label={`${a.name}, ${s.label}, ${fmt.pct(a.realization)} realized, renews in ${a.daysToRenewal} days, ARR ${fmt.money(a.arr_value)}`}
                    onMouseEnter={() => setHover({ id: a.id, x: cx + MARGIN.left, y: cy + MARGIN.top })}
                    onFocus={() => setHover({ id: a.id, x: cx + MARGIN.left, y: cy + MARGIN.top })}
                    onBlur={() => setHover(null)}
                    onClick={() => openAccount(a.id)}
                    onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), openAccount(a.id))}
                  >
                    {a.hasActiveIntervention && (
                      <>
                        <circle r={radius + 6} fill="none" stroke="#22d3ee" strokeWidth="1.5" strokeOpacity="0.9" />
                        <circle r={radius + 6} fill="none" stroke="#22d3ee" strokeWidth="2" className="ring-pulse" />
                      </>
                    )}
                    <circle r={Math.max(radius, 10)} fill="transparent" />
                    <circle
                      r={radius}
                      fill={s.color}
                      fillOpacity={isHover ? 0.4 : 0.22}
                      stroke={s.color}
                      strokeWidth={isHover || isSelected ? 2.5 : 1.5}
                      filter={a.status !== 'On Track' || isHover ? 'url(#radar-glow)' : undefined}
                    />
                    <circle r={Math.min(3, radius / 2)} fill={s.color} />
                    {isSelected && <circle r={radius + 3} fill="none" stroke="#f8fafc" strokeWidth="1.5" />}
                    {labelled.has(a.id) && (
                      <text
                        y={-radius - (a.hasActiveIntervention ? 12 : 6)}
                        textAnchor="middle"
                        className="pointer-events-none fill-slate-300 text-[11px] font-medium"
                        stroke={SURFACE}
                        strokeWidth="3"
                        paintOrder="stroke"
                      >
                        {a.name}
                      </text>
                    )}
                  </g>
                )
              })}
            </g>
          </svg>
        )}

        {ready && visible.length === 0 && (
          <div className="absolute inset-0 grid place-items-center">
            <EmptyState icon={Crosshair} title="Nothing on the radar">
              Every status is filtered out — re-enable one in the legend.
            </EmptyState>
          </div>
        )}

        {hover && (() => {
          const account = accounts.find((a) => a.id === hover.id)
          return account ? <Tooltip account={account} x={hover.x} y={hover.y} bounds={{ width, height }} /> : null
        })()}
      </div>
    </Panel>
  )
}
