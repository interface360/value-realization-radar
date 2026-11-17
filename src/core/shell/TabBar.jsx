import { cx } from '../ui/cx.js'

export function TabBar({ tabs, activeId, onSelect }) {
  return (
    <nav role="tablist" className="flex gap-1 overflow-x-auto rounded-xl bg-slate-900/60 p-1 ring-1 ring-white/5">
      {tabs.map((tab) => {
        const Icon = tab.icon
        const active = tab.id === activeId
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onSelect(tab.id)}
            className={cx(
              'group flex shrink-0 items-center gap-2 rounded-lg px-4 py-2 text-sm transition',
              active ? 'bg-cyan-400/10 text-cyan-100 shadow-[0_0_20px_-6px] shadow-cyan-400/50 ring-1 ring-cyan-400/30' : 'text-slate-400 hover:bg-white/5 hover:text-slate-200',
            )}
          >
            {Icon && <Icon className={cx('size-4', active ? 'text-cyan-300' : 'text-slate-500 group-hover:text-slate-300')} />}
            {tab.name}
            {tab.version.status !== 'stable' && (
              <span className="rounded bg-amber-400/15 px-1 font-mono text-[9px] tracking-wider text-amber-300 uppercase">{tab.version.status}</span>
            )}
          </button>
        )
      })}
    </nav>
  )
}
