import { useState } from 'react'
import { Building2, CircleAlert, Cloud, FileSpreadsheet, FlaskConical, LoaderCircle, Plus, Server, Webhook } from 'lucide-react'
import { ActionButton, cx, EmptyState, fmt, Panel, SectionHeader, useDataContext, useWorkspaceSession } from '@core'
import { ENTITY_ORDER, TARGET_SCHEMA } from '../../../../shared/mapping/index.js'
import { ConnectionDetail } from './ConnectionDetail.jsx'
import { NewConnection } from './NewConnection.jsx'
import { useApi, useResource } from './useApi.js'

const ICONS = { crm: Cloud, generic: Webhook, file: FileSpreadsheet, demo: FlaskConical }
const STATUS_STYLE = {
  ok: ['bg-emerald-400', 'Healthy'],
  syncing: ['bg-cyan-400 animate-pulse', 'Syncing'],
  error: ['bg-rose-400', 'Error'],
  new: ['bg-slate-500', 'Not synced'],
}

function LocalModeNotice() {
  const { connect, defaultServerUrl } = useWorkspaceSession()
  const [serverUrl, setServerUrl] = useState(defaultServerUrl)
  const [apiKey, setApiKey] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  return (
    <Panel className="mx-auto max-w-2xl p-6">
      <div className="flex items-start gap-4">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-amber-400/10 text-amber-300 ring-1 ring-amber-400/30">
          <Server className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-base font-semibold text-slate-100">Connect a tenant workspace to sync real data</h3>
          <p className="mt-1 text-sm text-slate-400">
            You&apos;re viewing the local demo. CRM connections run on the VRR sync server (credentials stay server-side, encrypted, isolated per tenant). Start it with{' '}
            <code className="rounded bg-white/5 px-1 text-slate-300">npm run server</code> — the first start prints a tenant API key.
          </p>
          <form
            className="mt-4 grid gap-2 sm:grid-cols-[1fr_1.4fr_auto]"
            onSubmit={async (e) => {
              e.preventDefault()
              setBusy(true)
              setError(null)
              try {
                await connect(serverUrl, apiKey)
              } catch (err) {
                setError(err.status === 401 ? 'That API key was rejected.' : err.message)
              } finally {
                setBusy(false)
              }
            }}
          >
            <input value={serverUrl} onChange={(e) => setServerUrl(e.target.value)} aria-label="Sync server URL" className="rounded-lg bg-slate-950/60 px-3 py-2 font-mono text-xs text-slate-100 ring-1 ring-white/10 outline-none focus:ring-cyan-400/50" />
            <input
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              type="password"
              placeholder="Tenant API key (vrr_t_…)"
              aria-label="Tenant API key"
              className="rounded-lg bg-slate-950/60 px-3 py-2 font-mono text-xs text-slate-100 ring-1 ring-white/10 outline-none focus:ring-cyan-400/50"
            />
            <ActionButton type="submit" size="sm" disabled={busy || !apiKey} icon={busy ? LoaderCircle : Building2}>
              Connect
            </ActionButton>
          </form>
          {error && <p className="mt-2 text-xs text-rose-300">{error}</p>}
        </div>
      </div>
    </Panel>
  )
}

function ConnectionCard({ connection, connector, onOpen }) {
  const Icon = ICONS[connector?.category] ?? Cloud
  const [dot, label] = STATUS_STYLE[connection.status] ?? STATUS_STYLE.new
  const mapped = ENTITY_ORDER.filter((e) => connection.mapping?.[e]?.enabled)
  return (
    <button type="button" onClick={onOpen} className="group flex flex-col gap-3 rounded-xl bg-slate-900/80 p-4 text-left ring-1 ring-white/5 transition hover:bg-slate-900 hover:ring-cyan-400/30">
      <div className="flex items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-cyan-400/10 text-cyan-300 ring-1 ring-cyan-400/20">
          <Icon className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-slate-100">{connection.name}</p>
          <p className="truncate text-xs text-slate-500">{connector?.name ?? connection.connector}</p>
        </div>
        <span className="inline-flex items-center gap-1.5 text-[11px] text-slate-400">
          <span className={cx('size-1.5 rounded-full', dot)} />
          {label}
        </span>
      </div>
      <div className="flex flex-wrap gap-1">
        {mapped.length ? (
          mapped.map((e) => (
            <span key={e} className="rounded bg-white/5 px-1.5 py-0.5 text-[10px] text-slate-300">
              {TARGET_SCHEMA[e].label}
            </span>
          ))
        ) : (
          <span className="text-[11px] text-amber-300/80">No entities mapped yet</span>
        )}
      </div>
      <p className="font-mono text-[11px] text-slate-500">
        {connection.last_success_at ? `synced ${fmt.relativeTime(connection.last_success_at)}` : 'never synced'}
        {connection.schedule_minutes ? ` · every ${connection.schedule_minutes >= 60 ? `${connection.schedule_minutes / 60}h` : `${connection.schedule_minutes}m`}` : ' · manual'}
      </p>
      {connection.last_error && (
        <p className="flex items-start gap-1 text-[11px] text-rose-300">
          <CircleAlert className="mt-0.5 size-3 shrink-0" />
          <span className="line-clamp-2">{connection.last_error}</span>
        </p>
      )}
    </button>
  )
}

export default function DataSources({ options }) {
  const api = useApi()
  const { workspace } = useDataContext()
  const [view, setView] = useState({ name: 'list' })
  const catalog = useResource(() => (api ? api.connectors() : Promise.resolve([])), [api])
  const list = useResource(() => (api ? api.connections.list() : Promise.resolve([])), [api])

  if (!api) {
    return (
      <div className="flex flex-1 flex-col gap-4">
        <SectionHeader eyebrow="Data sources · pull from any CRM" title="Bring your own data" />
        <LocalModeNotice />
      </div>
    )
  }

  const connectors = catalog.data ?? []
  const byId = new Map(connectors.map((c) => [c.id, c]))
  const upsertLocal = (c) => list.setData((list.data ?? []).map((x) => (x.id === c.id ? c : x)))

  return (
    <div className="flex flex-1 flex-col gap-4">
      <SectionHeader eyebrow={`Data sources · ${workspace.tenant.name}`} title="Pull data from any CRM">
        {view.name === 'list' && (
          <ActionButton icon={Plus} onClick={() => setView({ name: 'new' })} disabled={!connectors.length}>
            Add connection
          </ActionButton>
        )}
      </SectionHeader>

      {(catalog.error || list.error) && <Panel className="p-4 text-sm text-rose-200">{(catalog.error ?? list.error).message}</Panel>}

      {view.name === 'new' && (
        <NewConnection
          api={api}
          connectors={connectors}
          showAdvanced={options.showAdvanced}
          onCancel={() => setView({ name: 'list' })}
          onCreated={(c) => {
            list.setData([...(list.data ?? []), c])
            setView({ name: 'detail', id: c.id })
          }}
        />
      )}

      {view.name === 'detail' &&
        (() => {
          const conn = list.data?.find((c) => c.id === view.id)
          const connector = conn && byId.get(conn.connector)
          return conn && connector ? (
            <ConnectionDetail
              key={conn.id}
              api={api}
              connector={connector}
              connection={conn}
              options={options}
              onBack={() => (setView({ name: 'list' }), list.reload())}
              onChanged={upsertLocal}
              onDeleted={() => (setView({ name: 'list' }), list.reload())}
            />
          ) : (
            <Panel className="p-6 text-sm text-slate-400">Loading…</Panel>
          )
        })()}

      {view.name === 'list' &&
        (list.loading && !list.data ? (
          <Panel className="p-8 text-center text-sm text-slate-500">
            <LoaderCircle className="mr-2 inline size-4 animate-spin" />
            Loading connections…
          </Panel>
        ) : list.data?.length ? (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {list.data.map((c) => (
              <ConnectionCard key={c.id} connection={c} connector={byId.get(c.connector)} onOpen={() => setView({ name: 'detail', id: c.id })} />
            ))}
          </div>
        ) : (
          <Panel>
            <EmptyState icon={Cloud} title="No connections yet">
              Add Salesforce, ServiceNow, HubSpot, any REST CRM or a CSV export. Try the Demo CRM to see the full flow without credentials.
            </EmptyState>
            <div className="flex justify-center pb-8">
              <ActionButton icon={Plus} onClick={() => setView({ name: 'new' })}>
                Add your first connection
              </ActionButton>
            </div>
          </Panel>
        ))}
    </div>
  )
}
