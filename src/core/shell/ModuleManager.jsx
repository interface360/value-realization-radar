import { useState } from 'react'
import { ChevronRight, Database, Lock, RotateCcw, X } from 'lucide-react'
import { useDataContext } from '../data/context.js'
import { resetDatabase } from '../data/usePortfolio.js'
import { useModules } from '../modules/context.js'
import { cx } from '../ui/cx.js'

const STATUS_STYLE = {
  stable: 'bg-emerald-400/10 text-emerald-300',
  beta: 'bg-amber-400/15 text-amber-300',
  experimental: 'bg-fuchsia-400/15 text-fuchsia-300',
  deprecated: 'bg-slate-500/20 text-slate-400',
}

function Toggle({ checked, disabled, onChange, label }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cx(
        'relative h-5 w-9 shrink-0 rounded-full transition disabled:cursor-not-allowed disabled:opacity-40',
        checked ? 'bg-cyan-400/70 shadow-[0_0_10px] shadow-cyan-400/50' : 'bg-slate-700',
      )}
    >
      <span className={cx('absolute top-0.5 size-4 rounded-full bg-white transition-all', checked ? 'left-[18px]' : 'left-0.5')} />
    </button>
  )
}

function OptionField({ schema, value, onChange, disabled }) {
  if (schema.type === 'boolean') return <Toggle checked={value} onChange={onChange} disabled={disabled} label={schema.label} />
  if (schema.type === 'select')
    return (
      <select
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-md bg-slate-800 px-2 py-1 text-xs text-slate-200 ring-1 ring-white/10 outline-none"
      >
        {schema.choices.map((c) => (
          <option key={c.value} value={c.value}>
            {c.label}
          </option>
        ))}
      </select>
    )
  if (schema.type === 'number')
    return (
      <div className="flex items-center gap-2">
        <input
          type="range"
          min={schema.min}
          max={schema.max}
          step={schema.step ?? 1}
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(Number(e.target.value))}
          className="w-24 accent-cyan-400"
        />
        <span className="w-12 text-right font-mono text-xs text-slate-300 tabular-nums">
          {value}
          {schema.unit}
        </span>
      </div>
    )
  return null
}

function ModuleCard({ module }) {
  const { setOverride, resetOverride } = useModules()
  const [expanded, setExpanded] = useState(false)
  const Icon = module.icon
  const v = module.version
  const options = Object.entries(module.optionSchema)

  return (
    <li className={cx('rounded-xl ring-1 transition', module.enabled ? 'bg-slate-900/80 ring-white/10' : 'bg-slate-900/30 ring-white/5')}>
      <div className="flex items-center gap-3 p-3">
        <div className={cx('grid size-8 shrink-0 place-items-center rounded-lg', module.enabled ? 'bg-cyan-400/10 text-cyan-300' : 'bg-slate-800 text-slate-500')}>
          {Icon && <Icon className="size-4" />}
        </div>
        <button type="button" onClick={() => setExpanded((e) => !e)} className="min-w-0 flex-1 text-left">
          <div className="flex items-center gap-2">
            <span className={cx('truncate text-sm font-medium', module.enabled ? 'text-slate-100' : 'text-slate-400')}>{module.name}</span>
            <span className="font-mono text-[10px] text-slate-500">v{v.version}</span>
            <span className={cx('rounded px-1 font-mono text-[9px] tracking-wider uppercase', STATUS_STYLE[v.status])}>{v.status}</span>
          </div>
          <p className="truncate text-xs text-slate-500">
            <span className="font-mono">{module.slot}</span> · {module.description}
          </p>
        </button>
        {module.locked ? (
          <Lock className="size-4 text-slate-500" aria-label="Locked in modules.config.js" />
        ) : (
          <Toggle checked={module.enabled} onChange={(enabled) => setOverride(module.id, { enabled })} label={`Enable ${module.name}`} />
        )}
        <button type="button" onClick={() => setExpanded((e) => !e)} aria-label="Details" className="text-slate-500 hover:text-slate-300">
          <ChevronRight className={cx('size-4 transition', expanded && 'rotate-90')} />
        </button>
      </div>

      {expanded && (
        <div className="space-y-4 border-t border-white/5 p-3 text-xs">
          <div className="flex items-center justify-between gap-3">
            <span className="text-slate-400">Version</span>
            <select
              value={v.version}
              disabled={module.locked}
              onChange={(e) => setOverride(module.id, { version: e.target.value })}
              className="rounded-md bg-slate-800 px-2 py-1 font-mono text-xs text-slate-200 ring-1 ring-white/10 outline-none"
            >
              {module.versions.map((ver) => (
                <option key={ver.version} value={ver.version}>
                  {ver.version} · {ver.status}
                </option>
              ))}
            </select>
          </div>
          {module.versionWarning && <p className="text-amber-300">{module.versionWarning}</p>}

          {v.changelog.length > 0 && (
            <div>
              <p className="mb-1 text-slate-400">What&apos;s in v{v.version}</p>
              <ul className="list-disc space-y-0.5 pl-4 text-slate-500">
                {v.changelog.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </div>
          )}

          {options.length > 0 && (
            <div className="space-y-2">
              <p className="text-slate-400">Options</p>
              {options.map(([key, schema]) => (
                <div key={key} className="flex items-center justify-between gap-3">
                  <span className="text-slate-300" title={schema.help}>
                    {schema.label}
                  </span>
                  <OptionField
                    schema={schema}
                    value={module.options[key]}
                    disabled={module.locked}
                    onChange={(val) => setOverride(module.id, { options: { [key]: val } })}
                  />
                </div>
              ))}
            </div>
          )}

          {module.isOverridden && (
            <button type="button" onClick={() => resetOverride(module.id)} className="inline-flex items-center gap-1 text-slate-400 hover:text-slate-200">
              <RotateCcw className="size-3" /> Reset to config defaults
            </button>
          )}
        </div>
      )}
    </li>
  )
}

export function ModuleManager({ open, onClose }) {
  const { modules, resetAll } = useModules()
  const dataKind = useDataContext().provider.kind
  const [confirmReset, setConfirmReset] = useState(false)
  if (!open) return null

  const groups = ['tab', 'header', 'overlay'].map((slot) => [slot, modules.filter((m) => m.slot === slot)])

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 bg-slate-950/70 backdrop-blur-sm" />
      <aside className="relative flex h-full w-full max-w-md flex-col bg-slate-950/95 shadow-2xl ring-1 ring-white/10">
        <div className="flex items-center justify-between border-b border-white/5 p-4">
          <div>
            <h2 className="text-base font-semibold text-slate-100">Module Manager</h2>
            <p className="text-xs text-slate-500">Runtime overrides — saved in this browser. Defaults live in src/config/modules.config.js</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-1.5 text-slate-400 hover:bg-white/5 hover:text-slate-100">
            <X className="size-5" />
          </button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto p-4">
          {groups.map(([slot, list]) =>
            list.length ? (
              <section key={slot}>
                <p className="mb-2 font-mono text-[10px] tracking-[0.25em] text-slate-500 uppercase">{slot} modules</p>
                <ul className="space-y-2">
                  {list.map((m) => (
                    <ModuleCard key={m.id} module={m} />
                  ))}
                </ul>
              </section>
            ) : null,
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/5 p-4 text-xs">
          <button type="button" onClick={resetAll} className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-slate-400 ring-1 ring-white/10 hover:text-slate-100">
            <RotateCcw className="size-3.5" /> Reset all overrides
          </button>
          {confirmReset ? (
            <span className="flex items-center gap-2">
              <span className="text-rose-300">{dataKind === 'local' ? 'Erase all local data?' : 'Clear interventions & activity for this workspace?'}</span>
              <button
                type="button"
                onClick={async () => {
                  await resetDatabase()
                  setConfirmReset(false)
                }}
                className="rounded-lg bg-rose-500/20 px-2.5 py-1.5 text-rose-200 ring-1 ring-rose-500/40 hover:bg-rose-500/30"
              >
                Reset
              </button>
              <button type="button" onClick={() => setConfirmReset(false)} className="text-slate-400 hover:text-slate-200">
                Cancel
              </button>
            </span>
          ) : (
            <button type="button" onClick={() => setConfirmReset(true)} className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-slate-400 ring-1 ring-white/10 hover:text-rose-200">
              <Database className="size-3.5" /> {dataKind === 'local' ? 'Reset demo data' : 'Reset app data'}
            </button>
          )}
        </div>
      </aside>
    </div>
  )
}
