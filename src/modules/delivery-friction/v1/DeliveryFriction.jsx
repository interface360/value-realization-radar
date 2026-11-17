import * as d3 from 'd3'
import { useMemo, useState } from 'react'
import { CircleCheck } from 'lucide-react'
import {
  BLOCKER_ORDER,
  BLOCKERS,
  EmptyState,
  fmt,
  HoverCard,
  HoverRow,
  Panel,
  SectionHeader,
  STATUS,
  SURFACE,
  useElementSize,
  usePortfolio,
  useWorkspace,
} from '@core'

const GROUP_HEADER = 56
const GAP = 2

function buildTree(accounts, attribution) {
  const groups = new Map(BLOCKER_ORDER.map((b) => [b, []]))
  for (const a of accounts) {
    if (!a.blockers.length) continue
    const share = attribution === 'split' ? a.arr_value / a.blockers.length : a.arr_value
    for (const b of a.blockers) {
      const projects = a.projects.filter((p) => p.blocker_type === b)
      // A blocked account is as bad as its worst project on that blocker.
      const status = projects.some((p) => p.status === 'Stalled') ? 'Stalled' : 'Delayed'
      groups.get(b)?.push({ account: a, value: share, status, projects })
    }
  }
  const children = [...groups].filter(([, list]) => list.length).map(([blocker, list]) => ({ blocker, children: list }))
  return d3
    .hierarchy({ children })
    .sum((d) => d.value ?? 0)
    .sort((a, b) => b.value - a.value)
}

export default function DeliveryFriction({ options }) {
  const { accounts, loading } = usePortfolio()
  const { openAccount } = useWorkspace()
  const [ref, { width, height }] = useElementSize()
  const [hover, setHover] = useState(null)

  const root = useMemo(() => {
    if (!width || !height) return null
    const tree = buildTree(accounts, options.attribution)
    return d3
      .treemap()
      .size([width, height])
      .paddingInner(6)
      .paddingTop((n) => (n.depth === 1 ? GROUP_HEADER : 0))
      .paddingRight((n) => (n.depth === 1 ? 4 : 0))
      .paddingBottom((n) => (n.depth === 1 ? 4 : 0))
      .paddingLeft((n) => (n.depth === 1 ? 4 : 0))
      .tile(d3.treemapSquarify.ratio(1.2))
      .round(true)(tree)
  }, [accounts, options.attribution, width, height])

  const groups = root?.children ?? []
  const top = groups[0]
  const totalBlocked = root?.value ?? 0

  if (loading) return null

  return (
    <div className="flex flex-1 flex-col gap-4">
      <SectionHeader eyebrow="Tab 2 · Delivery friction · product loop" title="Which product gaps are stalling revenue?">
        {top && (
          <div className="flex items-center gap-3 rounded-xl bg-rose-500/10 px-4 py-2.5 ring-1 ring-rose-500/25">
            {(() => {
              const Icon = BLOCKERS[top.data.blocker].icon
              return <Icon className="size-5 text-rose-300" />
            })()}
            <p className="text-sm text-slate-300">
              <span className="font-medium text-slate-100">{BLOCKERS[top.data.blocker].label}</span> is stalling{' '}
              <span className="font-mono text-lg text-rose-300 tabular-nums">{fmt.money(top.value, { precise: true })}</span> in ARR
            </p>
          </div>
        )}
      </SectionHeader>

      <Panel className="flex flex-1 flex-col p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500">
          <p>
            Block area = ARR tied to each blocker
            {options.attribution === 'split' ? ' (split across an account’s blockers)' : ' (an account can appear under several blockers)'}
          </p>
          <div className="flex items-center gap-3">
            {['Stalled', 'Delayed'].map((k) => {
              const Icon = STATUS[k].icon
              return (
                <span key={k} className="inline-flex items-center gap-1.5">
                  <span className="size-2.5 rounded-sm" style={{ backgroundColor: STATUS[k].color }} />
                  <Icon className="size-3" style={{ color: STATUS[k].color }} />
                  {STATUS[k].label} project
                </span>
              )
            })}
          </div>
        </div>

        <div ref={ref} className="relative min-h-[460px] flex-1" onMouseLeave={() => setHover(null)}>
          {root && groups.length === 0 && (
            <div className="absolute inset-0 grid place-items-center">
              <EmptyState icon={CircleCheck} title="No logged blockers">
                Log a blocker from the Intervention Drawer and it appears here.
              </EmptyState>
            </div>
          )}

          {groups.map((g) => {
            const meta = BLOCKERS[g.data.blocker]
            const Icon = meta.icon
            const w = g.x1 - g.x0
            const h = g.y1 - g.y0
            const share = totalBlocked ? g.value / totalBlocked : 0
            return (
              <div
                key={g.data.blocker}
                className="absolute overflow-hidden rounded-xl bg-slate-900 ring-1 ring-white/10"
                style={{ left: g.x0, top: g.y0, width: w, height: h }}
              >
                <div className="flex items-start justify-between gap-2 px-3 pt-2.5" style={{ height: GROUP_HEADER }}>
                  <div className="flex min-w-0 items-center gap-2">
                    <Icon className="size-4 shrink-0 text-slate-300" />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-slate-100">{meta.label}</p>
                      <p className="truncate text-[11px] text-slate-500">
                        {g.children.length} accounts · {fmt.pct(share)} of blocked ARR
                      </p>
                    </div>
                  </div>
                  <p className="shrink-0 font-mono text-xl text-slate-50 tabular-nums">{fmt.money(g.value, { precise: true })}</p>
                </div>
              </div>
            )
          })}

          {groups.flatMap((g) =>
            g.children.map((leaf) => {
              const { account, status } = leaf.data
              const color = STATUS[status].color
              const w = leaf.x1 - leaf.x0
              const h = leaf.y1 - leaf.y0
              const isHover = hover?.key === `${g.data.blocker}:${account.id}`
              const roomy = w > 90 && h > 44
              if (!options.showAccounts) return null
              return (
                <button
                  key={`${g.data.blocker}:${account.id}`}
                  type="button"
                  onClick={() => openAccount(account.id)}
                  onMouseEnter={(e) => {
                    const box = e.currentTarget.parentElement.getBoundingClientRect()
                    const r = e.currentTarget.getBoundingClientRect()
                    setHover({ key: `${g.data.blocker}:${account.id}`, leaf, blocker: g.data.blocker, x: r.right - box.left - 6, y: r.top - box.top + r.height / 2 })
                  }}
                  className="absolute overflow-hidden rounded-md text-left transition-[background-color,box-shadow] duration-150"
                  style={{
                    left: leaf.x0 + GAP / 2,
                    top: leaf.y0 + GAP / 2,
                    width: Math.max(0, w - GAP),
                    height: Math.max(0, h - GAP),
                    backgroundColor: `${color}${isHover ? '40' : '24'}`,
                    boxShadow: `inset 0 0 0 1px ${color}${isHover ? 'aa' : '55'}${isHover ? `, 0 0 18px -4px ${color}` : ''}, 0 0 0 1px ${SURFACE}`,
                  }}
                  aria-label={`${account.name}, ${fmt.money(leaf.value)} tied to ${BLOCKERS[g.data.blocker].label}`}
                >
                  {roomy && (
                    <span className="block p-2">
                      <span className="block truncate text-xs font-medium text-slate-100">{account.name}</span>
                      <span className="block font-mono text-[11px] text-slate-300 tabular-nums">{fmt.money(leaf.value)}</span>
                    </span>
                  )}
                </button>
              )
            }),
          )}

          {hover && (
            <HoverCard x={hover.x} y={hover.y} bounds={{ width, height }}>
              <p className="text-sm font-semibold text-slate-50">{hover.leaf.data.account.name}</p>
              <p className="mb-2 text-slate-500">{BLOCKERS[hover.blocker].label}</p>
              <HoverRow label="ARR tied" value={fmt.money(hover.leaf.value, { precise: true })} />
              <HoverRow label="Realization" value={fmt.pct(hover.leaf.data.account.realization, 1)} />
              <HoverRow label="Renews in" value={fmt.days(hover.leaf.data.account.daysToRenewal)} />
              <div className="mt-2 space-y-0.5 border-t border-white/5 pt-2">
                {hover.leaf.data.projects.map((p) => (
                  <p key={p.id} className="flex justify-between gap-2">
                    <span className="truncate text-slate-300">{p.name}</span>
                    <span style={{ color: STATUS[p.status].color }}>{p.status}</span>
                  </p>
                ))}
              </div>
            </HoverCard>
          )}
        </div>
      </Panel>
    </div>
  )
}
