import { Radar, Settings2, Sparkles } from 'lucide-react'
import { APP_CONFIG } from '@config/app.config.js'
import { useDataContext } from '../data/context.js'
import { usePortfolio } from '../data/usePortfolio.js'
import { useModules } from '../modules/context.js'
import { cx } from '../ui/cx.js'
import { useWorkspace } from './workspace.js'
import { WorkspaceSwitcher } from './WorkspaceSwitcher.jsx'

// Shown only when the assistant overlay module is enabled.
function AssistantButton() {
  const { isEnabled } = useModules()
  const { openPanel, togglePanel } = useWorkspace()
  if (!isEnabled('assistant')) return null
  const open = openPanel === 'assistant'
  return (
    <button
      type="button"
      onClick={() => togglePanel('assistant')}
      aria-pressed={open}
      className={cx(
        'inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm ring-1 transition',
        open ? 'bg-violet-400/15 text-violet-100 ring-violet-400/40' : 'bg-white/5 text-slate-300 ring-white/10 hover:bg-white/10 hover:text-slate-100',
      )}
    >
      <Sparkles className="size-4 text-violet-300" />
      <span className="hidden sm:inline">Assistant</span>
    </button>
  )
}

function DataStatus() {
  const { provider } = useDataContext()
  const { error } = usePortfolio()
  const [dot, label] = error
    ? ['bg-rose-400 shadow-rose-400', 'SERVER UNREACHABLE']
    : provider.kind === 'local'
      ? ['bg-amber-400 shadow-amber-400', 'LOCAL DEMO DB']
      : ['bg-emerald-400 shadow-emerald-400', 'SYNCED · LIVE']
  return (
    <span className="hidden items-center gap-2 font-mono text-[11px] text-slate-500 lg:flex" title={error?.message}>
      <span className={`size-1.5 animate-pulse rounded-full shadow-[0_0_8px] ${dot}`} />
      {label}
    </span>
  )
}

export function Header({ onOpenManager }) {
  return (
    <header className="relative z-20 mx-auto flex w-full max-w-[1600px] items-center justify-between gap-4 px-4 py-4 sm:px-6">
      <div className="flex items-center gap-3">
        <div className="relative grid size-9 place-items-center rounded-xl bg-cyan-400/10 ring-1 ring-cyan-400/30">
          <Radar className="size-5 text-cyan-300" />
          <span className="absolute inset-0 animate-ping rounded-xl ring-1 ring-cyan-400/20 [animation-duration:3s]" />
        </div>
        <div>
          <h1 className="text-base font-semibold tracking-tight text-slate-50">{APP_CONFIG.name}</h1>
          <p className="font-mono text-[10px] tracking-[0.2em] text-slate-500 uppercase">{APP_CONFIG.tagline}</p>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <DataStatus />
        <WorkspaceSwitcher />
        <AssistantButton />
        <button
          type="button"
          onClick={onOpenManager}
          className="inline-flex items-center gap-2 rounded-lg bg-white/5 px-3 py-2 text-sm text-slate-300 ring-1 ring-white/10 transition hover:bg-white/10 hover:text-slate-100"
        >
          <Settings2 className="size-4" />
          <span className="hidden sm:inline">Modules</span>
        </button>
      </div>
    </header>
  )
}
