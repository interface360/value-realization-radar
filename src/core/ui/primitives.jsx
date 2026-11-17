import { BLOCKERS, INTERVENTIONS, STATUS } from '../theme/tokens.js'
import { cx } from './cx.js'

export function Panel({ className, children, ...rest }) {
  return (
    <div className={cx('rounded-2xl bg-slate-900/60 ring-1 ring-white/5 backdrop-blur-sm', className)} {...rest}>
      {children}
    </div>
  )
}

export function SectionHeader({ eyebrow, title, children, className }) {
  return (
    <div className={cx('flex flex-wrap items-end justify-between gap-4', className)}>
      <div>
        {eyebrow && <p className="font-mono text-[10px] tracking-[0.25em] text-cyan-300/70 uppercase">{eyebrow}</p>}
        <h2 className="mt-1 text-lg font-semibold text-slate-100">{title}</h2>
      </div>
      {children}
    </div>
  )
}

// Status always ships with icon + label — color is never the only cue.
export function StatusPill({ status, size = 'sm', className }) {
  const s = STATUS[status]
  const Icon = s.icon
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1.5 rounded-full font-medium whitespace-nowrap',
        size === 'sm' ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-1 text-xs',
        className,
      )}
      style={{ color: s.color, backgroundColor: `${s.color}1a`, boxShadow: `inset 0 0 0 1px ${s.color}33` }}
    >
      <Icon className={size === 'sm' ? 'size-3' : 'size-3.5'} />
      {s.label}
    </span>
  )
}

export function BlockerTag({ type, className }) {
  const b = BLOCKERS[type] ?? BLOCKERS.None
  const Icon = b.icon
  return (
    <span className={cx('inline-flex items-center gap-1 rounded-md bg-white/5 px-1.5 py-0.5 text-[11px] text-slate-300', className)}>
      <Icon className="size-3 text-slate-400" />
      {b.short}
    </span>
  )
}

export function InterventionTag({ type, className }) {
  const meta = INTERVENTIONS[type]
  const Icon = meta?.icon
  return (
    <span className={cx('inline-flex items-center gap-1 rounded-md bg-cyan-400/10 px-1.5 py-0.5 text-[11px] text-cyan-200 ring-1 ring-cyan-400/20', className)}>
      {Icon && <Icon className="size-3" />}
      {meta?.short ?? type}
    </span>
  )
}

export function Metric({ label, value, sub, tone, className, valueClassName }) {
  return (
    <div className={cx('min-w-0', className)}>
      <p className="text-[11px] tracking-wide text-slate-500 uppercase">{label}</p>
      <p className={cx('mt-0.5 font-mono text-slate-100 tabular-nums', valueClassName ?? 'text-base')} style={tone ? { color: tone } : undefined}>
        {value}
      </p>
      {sub && <p className="mt-0.5 truncate text-[11px] text-slate-500">{sub}</p>}
    </div>
  )
}

// Thin horizontal meter for a 0–1 ratio with an optional threshold tick.
export function RatioBar({ value, color, threshold, className }) {
  const clamped = Math.max(0, Math.min(1, value))
  return (
    <div className={cx('relative h-1.5 rounded-full bg-white/5', className)}>
      <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${clamped * 100}%`, backgroundColor: color, boxShadow: `0 0 8px ${color}80` }} />
      {threshold != null && <div className="absolute -inset-y-0.5 w-px bg-slate-400/60" style={{ left: `${threshold * 100}%` }} />}
    </div>
  )
}

const BUTTON_TONES = {
  primary: 'bg-cyan-400/15 text-cyan-100 ring-cyan-400/30 hover:bg-cyan-400/25 hover:ring-cyan-300/50 shadow-[0_0_16px_-4px] shadow-cyan-400/40',
  warning: 'bg-amber-400/15 text-amber-100 ring-amber-400/30 hover:bg-amber-400/25',
  critical: 'bg-rose-500/15 text-rose-100 ring-rose-500/30 hover:bg-rose-500/25',
  ghost: 'bg-white/5 text-slate-300 ring-white/10 hover:bg-white/10 hover:text-slate-100',
}

export function ActionButton({ icon: Icon, tone = 'primary', size = 'md', active, className, children, ...rest }) {
  return (
    <button
      type="button"
      className={cx(
        'inline-flex items-center justify-center gap-1.5 rounded-lg font-medium ring-1 transition-all duration-150 disabled:cursor-not-allowed disabled:opacity-40',
        size === 'sm' ? 'px-2.5 py-1.5 text-xs' : 'px-3.5 py-2 text-sm',
        active ? 'bg-emerald-400/10 text-emerald-200 ring-emerald-400/30' : BUTTON_TONES[tone],
        className,
      )}
      {...rest}
    >
      {Icon && <Icon className={size === 'sm' ? 'size-3.5' : 'size-4'} />}
      {children}
    </button>
  )
}

export function EmptyState({ icon: Icon, title, children }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
      {Icon && <Icon className="size-8 text-slate-600" />}
      <p className="text-sm font-medium text-slate-300">{title}</p>
      {children && <p className="max-w-sm text-xs text-slate-500">{children}</p>}
    </div>
  )
}
