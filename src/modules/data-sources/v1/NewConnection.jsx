import { useState } from 'react'
import { ArrowLeft, Cloud, FileSpreadsheet, FlaskConical, LoaderCircle, Webhook } from 'lucide-react'
import { ActionButton, cx, Panel } from '@core'
import { ConnectorForm } from './ConnectorForm.jsx'
import { formPayload } from './formPayload.js'

const ICONS = { crm: Cloud, generic: Webhook, file: FileSpreadsheet, demo: FlaskConical }

export function NewConnection({ api, connectors, onCreated, onCancel, showAdvanced }) {
  const [picked, setPicked] = useState(null)
  const [template, setTemplate] = useState(null)
  const [name, setName] = useState('')
  const [values, setValues] = useState({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  const pick = (c) => {
    setPicked(c)
    setName(c.id === 'demo' ? 'Demo CRM' : c.name)
    setValues({})
    setTemplate(null)
    setError(null)
  }
  const applyTemplate = (t) => {
    setTemplate(t.id)
    setName(t.label)
    setValues(Object.fromEntries(Object.entries(t.config).map(([k, v]) => [k, typeof v === 'object' ? JSON.stringify(v, null, 2) : v])))
  }

  const create = async () => {
    setBusy(true)
    setError(null)
    try {
      const conn = await api.connections.create({ name, connector: picked.id, values: formPayload(picked, values) })
      onCreated(conn)
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  if (!picked) {
    return (
      <Panel className="p-5">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <p className="font-mono text-[10px] tracking-[0.25em] text-cyan-300/70 uppercase">New connection</p>
            <h3 className="mt-1 text-base font-semibold text-slate-100">Choose a source</h3>
          </div>
          <ActionButton tone="ghost" size="sm" icon={ArrowLeft} onClick={onCancel}>
            Back
          </ActionButton>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {connectors.map((c) => {
            const Icon = ICONS[c.category] ?? Cloud
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => pick(c)}
                className="group flex items-start gap-3 rounded-xl bg-slate-950/40 p-4 text-left ring-1 ring-white/5 transition hover:bg-slate-900 hover:ring-cyan-400/30"
              >
                <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-cyan-400/10 text-cyan-300 ring-1 ring-cyan-400/20">
                  <Icon className="size-4" />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-slate-100">{c.name}</span>
                  <span className="mt-0.5 block text-xs text-slate-500">{c.description}</span>
                  {c.templates.length > 0 && <span className="mt-1.5 block text-[11px] text-cyan-300/70">Templates: {c.templates.map((t) => t.label).join(', ')}</span>}
                </span>
              </button>
            )
          })}
        </div>
      </Panel>
    )
  }

  return (
    <Panel className="p-5">
      <div className="mb-5 flex items-center justify-between gap-3">
        <div>
          <p className="font-mono text-[10px] tracking-[0.25em] text-cyan-300/70 uppercase">New connection · {picked.name}</p>
          <h3 className="mt-1 text-base font-semibold text-slate-100">Connection settings</h3>
        </div>
        <ActionButton tone="ghost" size="sm" icon={ArrowLeft} onClick={() => setPicked(null)}>
          All sources
        </ActionButton>
      </div>

      {picked.templates.length > 0 && (
        <div className="mb-5">
          <p className="mb-2 text-xs text-slate-400">Start from a template</p>
          <div className="flex flex-wrap gap-2">
            {picked.templates.map((t) => (
              <button
                key={t.id}
                type="button"
                title={t.description}
                onClick={() => applyTemplate(t)}
                className={cx('rounded-lg px-3 py-1.5 text-xs ring-1 transition', template === t.id ? 'bg-cyan-400/15 text-cyan-100 ring-cyan-400/40' : 'text-slate-300 ring-white/10 hover:bg-white/5')}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="mb-4">
        <label htmlFor="conn-name" className="mb-1 block text-xs text-slate-400">
          Connection name <span className="text-rose-400">*</span>
        </label>
        <input id="conn-name" value={name} onChange={(e) => setName(e.target.value)} className="w-full rounded-lg bg-slate-950/60 px-3 py-2 text-sm text-slate-100 ring-1 ring-white/10 outline-none focus:ring-cyan-400/50 sm:w-1/2" />
      </div>

      <ConnectorForm connector={picked} values={values} onChange={setValues} showAdvanced={showAdvanced || Boolean(template)} />

      {error && <p className="mt-4 rounded-lg bg-rose-500/10 px-3 py-2 text-xs text-rose-200 ring-1 ring-rose-500/30">{error}</p>}
      <div className="mt-5 flex gap-2">
        <ActionButton onClick={create} disabled={busy || !name.trim()} icon={busy ? LoaderCircle : undefined}>
          Create connection
        </ActionButton>
        <ActionButton tone="ghost" onClick={onCancel}>
          Cancel
        </ActionButton>
      </div>
    </Panel>
  )
}
