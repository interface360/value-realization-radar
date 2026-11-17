import { useState } from 'react'
import { ArrowLeft, CalendarClock, CircleAlert, CircleCheck, History, LoaderCircle, Play, PlugZap, RefreshCw, Save, Trash2, Upload } from 'lucide-react'
import { ActionButton, cx, fmt, Panel } from '@core'
import { TARGET_SCHEMA } from '../../../../shared/mapping/index.js'
import { ConnectorForm } from './ConnectorForm.jsx'
import { formPayload } from './formPayload.js'
import { MappingEditor } from './MappingEditor.jsx'
import { useRefreshPortfolio, useResource } from './useApi.js'

const SCHEDULE_LABELS = { null: 'Manual only', 15: 'Every 15 minutes', 60: 'Hourly', 360: 'Every 6 hours', 1440: 'Daily' }
const RUN_TONE = { success: 'text-emerald-300', partial: 'text-amber-300', failed: 'text-rose-300', running: 'text-cyan-300' }

function SettingsTab({ api, connection, connector, onChange, showAdvanced }) {
  const [values, setValues] = useState(() => ({ ...connection.config }))
  const [name, setName] = useState(connection.name)
  const [busy, setBusy] = useState(null)
  const [result, setResult] = useState(null)

  const save = async () => {
    setBusy('save')
    try {
      onChange(await api.connections.update(connection.id, { name, values: formPayload(connector, values) }))
      setResult({ ok: true, message: 'Settings saved' })
    } catch (e) {
      setResult({ ok: false, message: e.message })
    } finally {
      setBusy(null)
    }
  }
  const test = async () => {
    setBusy('test')
    try {
      await api.connections.update(connection.id, { name, values: formPayload(connector, values) }).then(onChange)
      setResult(await api.connections.test(connection.id))
    } catch (e) {
      setResult({ ok: false, message: e.message })
    } finally {
      setBusy(null)
    }
  }

  return (
    <Panel className="p-5">
      <div className="mb-4">
        <label htmlFor="edit-name" className="mb-1 block text-xs text-slate-400">
          Connection name
        </label>
        <input id="edit-name" value={name} onChange={(e) => setName(e.target.value)} className="w-full rounded-lg bg-slate-950/60 px-3 py-2 text-sm text-slate-100 ring-1 ring-white/10 outline-none focus:ring-cyan-400/50 sm:w-1/2" />
      </div>
      <ConnectorForm connector={connector} values={values} onChange={setValues} secretsSet={connection.secrets_set} showAdvanced={showAdvanced} />
      {result && (
        <p className={cx('mt-4 flex items-center gap-2 rounded-lg px-3 py-2 text-xs ring-1', result.ok ? 'bg-emerald-400/10 text-emerald-200 ring-emerald-400/30' : 'bg-rose-500/10 text-rose-200 ring-rose-500/30')}>
          {result.ok ? <CircleCheck className="size-4" /> : <CircleAlert className="size-4" />}
          {result.message}
        </p>
      )}
      <div className="mt-5 flex gap-2">
        <ActionButton icon={busy === 'test' ? LoaderCircle : PlugZap} onClick={test} disabled={Boolean(busy)}>
          Save & test connection
        </ActionButton>
        <ActionButton tone="ghost" icon={Save} onClick={save} disabled={Boolean(busy)}>
          Save
        </ActionButton>
      </div>
    </Panel>
  )
}

function CsvUploads({ api, connection, onUploaded }) {
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)
  const onFiles = async (files) => {
    setBusy(true)
    setMsg(null)
    try {
      const out = []
      for (const f of files) {
        const r = await api.connections.upload(connection.id, f.name, await f.text())
        out.push(`${r.id}: ${r.rows} rows, ${r.columns.length} columns`)
      }
      setMsg(out.join(' · '))
      onUploaded()
    } catch (e) {
      setMsg(e.message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <Panel className="flex flex-wrap items-center gap-3 p-4">
      <Upload className="size-4 text-cyan-300" />
      <p className="text-sm text-slate-300">Upload CSV exports — each file becomes a stream you can map.</p>
      <label className="ml-auto inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-cyan-400/15 px-3 py-1.5 text-xs font-medium text-cyan-100 ring-1 ring-cyan-400/30 hover:bg-cyan-400/25">
        {busy ? <LoaderCircle className="size-3.5 animate-spin" /> : <Upload className="size-3.5" />} Choose files
        <input type="file" accept=".csv,text/csv" multiple className="hidden" onChange={(e) => e.target.files.length && onFiles([...e.target.files])} />
      </label>
      {msg && <p className="w-full font-mono text-[11px] text-slate-400">{msg}</p>}
    </Panel>
  )
}

function RunHistory({ runs }) {
  const [open, setOpen] = useState(null)
  if (!runs?.length) return <p className="py-6 text-center text-sm text-slate-500">No syncs yet.</p>
  return (
    <ul className="space-y-1.5">
      {runs.map((r) => (
        <li key={r.id} className="rounded-lg bg-slate-950/40 ring-1 ring-white/5">
          <button type="button" onClick={() => setOpen(open === r.id ? null : r.id)} className="flex w-full flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2 text-left text-xs">
            <span className={cx('w-16 font-medium capitalize', RUN_TONE[r.status])}>{r.status}</span>
            <span className="text-slate-400">{fmt.relativeTime(r.started_at)}</span>
            <span className="text-slate-500">
              {r.trigger} · {r.mode}
            </span>
            <span className="ml-auto font-mono text-slate-400">
              {Object.entries(r.stats)
                .filter(([, s]) => !s.skipped)
                .map(([e, s]) => `${TARGET_SCHEMA[e]?.label ?? e} ${s.written}/${s.pulled}`)
                .join(' · ')}
            </span>
          </button>
          {open === r.id && (
            <div className="border-t border-white/5 px-3 py-2 font-mono text-[11px] text-slate-400">
              {r.error && <p className="mb-1 text-rose-300">{r.error}</p>}
              {r.log.map((l, i) => (
                <p key={i}>
                  <span className="text-slate-600">{l.at.slice(11, 19)}</span> {l.msg}
                </p>
              ))}
              {Object.entries(r.stats).flatMap(([e, s]) => (s.samples ?? []).slice(0, 3).map((x, i) => <p key={`${e}${i}`} className="text-amber-300/80">{`${e}: ${x.reasons.join('; ')}`}</p>))}
            </div>
          )}
        </li>
      ))}
    </ul>
  )
}

export function ConnectionDetail({ api, connector, connection: initial, onBack, onChanged, onDeleted, options }) {
  const [connection, setConnection] = useState(initial)
  const [tab, setTab] = useState(Object.values(initial.mapping ?? {}).some((m) => m?.enabled) ? 'mapping' : 'settings')
  const [syncing, setSyncing] = useState(false)
  const [syncResult, setSyncResult] = useState(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const refreshPortfolio = useRefreshPortfolio()
  const streams = useResource(() => api.connections.streams(connection.id), [api, connection.id, connection.updated_at])
  const runs = useResource(() => api.connections.runs(connection.id), [api, connection.id])

  const changed = (c) => {
    setConnection(c)
    onChanged(c)
  }

  const sync = async (mode) => {
    setSyncing(true)
    setSyncResult(null)
    try {
      const r = await api.connections.sync(connection.id, { mode })
      setSyncResult(r)
      await Promise.all([runs.reload(), refreshPortfolio(), api.connections.get(connection.id).then(changed)])
    } catch (e) {
      setSyncResult({ status: 'failed', error: e.message })
    } finally {
      setSyncing(false)
    }
  }

  const setSchedule = async (value) => changed(await api.connections.update(connection.id, { schedule_minutes: value === 'null' ? null : Number(value) }))

  return (
    <div className="space-y-4">
      <Panel className="flex flex-wrap items-center gap-4 p-4">
        <ActionButton tone="ghost" size="sm" icon={ArrowLeft} onClick={onBack}>
          Connections
        </ActionButton>
        <div className="min-w-0">
          <h3 className="truncate text-base font-semibold text-slate-100">{connection.name}</h3>
          <p className="text-xs text-slate-500">
            {connector.name} · last sync {connection.last_sync_at ? fmt.relativeTime(connection.last_sync_at) : 'never'}
            {connection.last_error && <span className="text-rose-300"> · {connection.last_error}</span>}
          </p>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <label className="inline-flex items-center gap-1.5 text-xs text-slate-400">
            <CalendarClock className="size-3.5" />
            <select value={String(connection.schedule_minutes)} onChange={(e) => setSchedule(e.target.value)} className="rounded-md bg-slate-950/60 px-2 py-1.5 text-xs text-slate-200 ring-1 ring-white/10 outline-none">
              {Object.entries(SCHEDULE_LABELS).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </label>
          <ActionButton size="sm" icon={syncing ? LoaderCircle : Play} onClick={() => sync('incremental')} disabled={syncing}>
            {syncing ? 'Pulling…' : 'Pull now'}
          </ActionButton>
          <ActionButton size="sm" tone="ghost" icon={RefreshCw} onClick={() => sync('full')} disabled={syncing} title="Re-pull everything and remove rows no longer in the source">
            Full refresh
          </ActionButton>
        </div>
        {syncResult && (
          <p className={cx('w-full text-xs', RUN_TONE[syncResult.status])}>
            {syncResult.status === 'failed'
              ? `Sync failed: ${syncResult.error}`
              : `Sync ${syncResult.status}: ${Object.entries(syncResult.stats)
                  .map(([e, s]) => (s.skipped ? `${TARGET_SCHEMA[e].label} skipped (${s.reason})` : `${TARGET_SCHEMA[e].label} ${s.written} written${s.rejected ? `, ${s.rejected} rejected` : ''}${s.unmatched ? `, ${s.unmatched} unmatched` : ''}`))
                  .join(' · ')}`}
          </p>
        )}
      </Panel>

      <div className="flex gap-1.5">
        {[
          ['mapping', 'Field mapping'],
          ['settings', 'Connection settings'],
          ['runs', 'Sync history'],
        ].map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => (setTab(id), id === 'runs' && runs.reload())}
            className={cx('rounded-lg px-3 py-1.5 text-xs ring-1 transition', tab === id ? 'bg-cyan-400/10 text-cyan-100 ring-cyan-400/40' : 'text-slate-400 ring-white/10 hover:text-slate-200')}
          >
            {id === 'runs' && <History className="mr-1 inline size-3.5" />}
            {label}
          </button>
        ))}
      </div>

      {connector.id === 'csv' && tab === 'mapping' && <CsvUploads api={api} connection={connection} onUploaded={streams.reload} />}

      {tab === 'settings' && <SettingsTab api={api} connection={connection} connector={connector} onChange={changed} showAdvanced={options.showAdvanced} />}
      {tab === 'mapping' &&
        (streams.error ? (
          <Panel className="p-5 text-sm text-rose-200">
            Couldn&apos;t list objects from the source: {streams.error.message}
            <button type="button" onClick={() => setTab('settings')} className="ml-2 underline">
              Check settings
            </button>
          </Panel>
        ) : streams.loading && !streams.data ? (
          <Panel className="p-8 text-center text-sm text-slate-500">
            <LoaderCircle className="mr-2 inline size-4 animate-spin" />
            Listing source objects…
          </Panel>
        ) : (
          <MappingEditor key={connection.id} api={api} connection={connection} streams={streams.data ?? []} sampleSize={options.sampleSize} onSaved={changed} />
        ))}
      {tab === 'runs' && (
        <Panel className="p-5">
          <RunHistory runs={runs.data} />
        </Panel>
      )}

      <div className="flex justify-end">
        {confirmDelete ? (
          <span className="flex items-center gap-2 text-xs">
            <span className="text-rose-300">Delete this connection and the data it synced?</span>
            <ActionButton size="sm" tone="critical" onClick={async () => (await api.connections.remove(connection.id), await refreshPortfolio(), onDeleted())}>
              Delete
            </ActionButton>
            <ActionButton size="sm" tone="ghost" onClick={() => setConfirmDelete(false)}>
              Cancel
            </ActionButton>
          </span>
        ) : (
          <ActionButton size="sm" tone="ghost" icon={Trash2} onClick={() => setConfirmDelete(true)}>
            Delete connection
          </ActionButton>
        )}
      </div>
    </div>
  )
}
