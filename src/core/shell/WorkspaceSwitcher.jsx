import { useEffect, useRef, useState } from 'react'
import { Building2, Check, ChevronDown, FlaskConical, LoaderCircle, Plus, Trash2 } from 'lucide-react'
import { useWorkspaceSession } from '../tenancy/useWorkspaceSession.js'
import { cx } from '../ui/cx.js'

// Tenant workspace picker. "Local demo" uses the embedded DB; every other entry
// is a tenant on a sync server, authenticated by its API key.
export function WorkspaceSwitcher() {
  const { session, active, connect, activate, forget, defaultServerUrl } = useWorkspaceSession()
  const [open, setOpen] = useState(false)
  const [adding, setAdding] = useState(false)
  const [serverUrl, setServerUrl] = useState(defaultServerUrl)
  const [apiKey, setApiKey] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e) => !ref.current?.contains(e.target) && setOpen(false)
    window.addEventListener('mousedown', onDown)
    return () => window.removeEventListener('mousedown', onDown)
  }, [open])

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await connect(serverUrl, apiKey)
      setAdding(false)
      setApiKey('')
      setOpen(false)
    } catch (err) {
      setError(err.status === 401 ? 'That API key was rejected by the server.' : err.message)
    } finally {
      setBusy(false)
    }
  }

  const label = active.mode === 'local' ? 'Local demo' : active.tenant.name
  const Icon = active.mode === 'local' ? FlaskConical : Building2

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="inline-flex max-w-56 items-center gap-2 rounded-lg bg-white/5 px-3 py-2 text-sm text-slate-200 ring-1 ring-white/10 transition hover:bg-white/10"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <Icon className={cx('size-4 shrink-0', active.mode === 'local' ? 'text-amber-300' : 'text-cyan-300')} />
        <span className="truncate">{label}</span>
        <ChevronDown className="size-3.5 shrink-0 text-slate-500" />
      </button>

      {open && (
        <div role="menu" className="absolute right-0 z-50 mt-2 w-80 rounded-xl bg-slate-900/95 p-2 shadow-2xl ring-1 shadow-black/60 ring-white/10 backdrop-blur-xl">
          <p className="px-2 pt-1 pb-2 font-mono text-[10px] tracking-[0.25em] text-slate-500 uppercase">Workspaces</p>
          <button
            type="button"
            onClick={() => (activate('local'), setOpen(false))}
            className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left text-sm hover:bg-white/5"
          >
            <FlaskConical className="size-4 text-amber-300" />
            <span className="flex-1">
              <span className="block text-slate-100">Local demo</span>
              <span className="block text-[11px] text-slate-500">Mock data in this browser</span>
            </span>
            {active.mode === 'local' && <Check className="size-4 text-cyan-300" />}
          </button>
          {session.workspaces.map((w) => (
            <div key={w.tenant.id} className="group flex items-center gap-1 rounded-lg hover:bg-white/5">
              <button type="button" onClick={() => (activate(w.tenant.id), setOpen(false))} className="flex min-w-0 flex-1 items-center gap-2.5 px-2 py-2 text-left text-sm">
                <Building2 className="size-4 shrink-0 text-cyan-300" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-slate-100">{w.tenant.name}</span>
                  <span className="block truncate font-mono text-[11px] text-slate-500">{w.serverUrl.replace(/^https?:\/\//, '')}</span>
                </span>
                {session.active === w.tenant.id && <Check className="size-4 shrink-0 text-cyan-300" />}
              </button>
              <button type="button" onClick={() => forget(w.tenant.id)} aria-label={`Forget ${w.tenant.name}`} className="mr-1 rounded p-1.5 text-slate-600 opacity-0 group-hover:opacity-100 hover:text-rose-300">
                <Trash2 className="size-3.5" />
              </button>
            </div>
          ))}

          <div className="mt-1 border-t border-white/5 pt-2">
            {adding ? (
              <form onSubmit={submit} className="space-y-2 px-1">
                <label className="block text-[11px] text-slate-400">
                  Sync server URL
                  <input value={serverUrl} onChange={(e) => setServerUrl(e.target.value)} className="mt-1 w-full rounded-md bg-slate-800 px-2 py-1.5 font-mono text-xs text-slate-100 ring-1 ring-white/10 outline-none focus:ring-cyan-400/50" />
                </label>
                <label className="block text-[11px] text-slate-400">
                  Tenant API key
                  <input
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder="vrr_t_…"
                    type="password"
                    autoComplete="off"
                    className="mt-1 w-full rounded-md bg-slate-800 px-2 py-1.5 font-mono text-xs text-slate-100 ring-1 ring-white/10 outline-none focus:ring-cyan-400/50"
                  />
                </label>
                {error && <p className="text-[11px] text-rose-300">{error}</p>}
                <div className="flex gap-2">
                  <button type="submit" disabled={busy || !apiKey} className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-md bg-cyan-400/15 px-2 py-1.5 text-xs font-medium text-cyan-100 ring-1 ring-cyan-400/30 hover:bg-cyan-400/25 disabled:opacity-40">
                    {busy && <LoaderCircle className="size-3.5 animate-spin" />} Connect
                  </button>
                  <button type="button" onClick={() => setAdding(false)} className="rounded-md px-2 py-1.5 text-xs text-slate-400 hover:text-slate-200">
                    Cancel
                  </button>
                </div>
                <p className="text-[10px] leading-relaxed text-slate-500">Run <code className="text-slate-400">npm run server</code> — the first start prints a demo tenant key.</p>
              </form>
            ) : (
              <button type="button" onClick={() => setAdding(true)} className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-sm text-slate-300 hover:bg-white/5">
                <Plus className="size-4" /> Connect a tenant workspace
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
