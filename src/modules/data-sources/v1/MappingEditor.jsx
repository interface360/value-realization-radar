import { useEffect, useMemo, useState } from 'react'
import { ArrowRight, CircleAlert, CircleCheck, Eye, LoaderCircle, Plus, Save, Trash2, WandSparkles, X } from 'lucide-react'
import { ActionButton, cx, Panel } from '@core'
import { ACCOUNT_MATCH, ENTITY_ORDER, TARGET_SCHEMA, TRANSFORMS, validateMapping } from '../../../../shared/mapping/index.js'

// Visual mapper: source stream → VRR entity, field by field, with transforms,
// enum value maps, auto-suggest and a live preview against sample records.

const inputCls = 'w-full rounded-md bg-slate-950/60 px-2 py-1.5 text-xs text-slate-100 ring-1 ring-white/10 outline-none focus:ring-cyan-400/50'
const TRANSFORM_KEYS = Object.keys(TRANSFORMS)

function emptyEntity() {
  return { enabled: false, stream: '', accountMatch: 'same_source', syncMode: 'incremental', fields: {} }
}

function TransformChips({ value = [], onChange }) {
  const [adding, setAdding] = useState(false)
  return (
    <div className="flex flex-wrap items-center gap-1">
      {value.map((t, i) => (
        <span key={`${t}-${i}`} className="inline-flex items-center gap-1 rounded bg-violet-400/10 px-1.5 py-0.5 font-mono text-[10px] text-violet-200 ring-1 ring-violet-400/20">
          {t}
          <button type="button" onClick={() => onChange(value.filter((_, j) => j !== i))} aria-label={`Remove ${t}`} className="text-violet-300/60 hover:text-violet-100">
            <X className="size-2.5" />
          </button>
        </span>
      ))}
      {adding ? (
        <select
          autoFocus
          className="rounded bg-slate-800 px-1 py-0.5 text-[10px] text-slate-200 outline-none"
          onBlur={() => setAdding(false)}
          onChange={(e) => {
            const name = e.target.value
            if (!name) return
            const arg = TRANSFORMS[name].arg ? window.prompt(`${TRANSFORMS[name].label}:`, TRANSFORMS[name].arg === 'number' ? '1' : ',') : null
            onChange([...value, arg != null ? `${name}:${arg}` : name])
            setAdding(false)
          }}
          defaultValue=""
        >
          <option value="" disabled>
            transform…
          </option>
          {TRANSFORM_KEYS.map((k) => (
            <option key={k} value={k}>
              {TRANSFORMS[k].label}
            </option>
          ))}
        </select>
      ) : (
        <button type="button" onClick={() => setAdding(true)} className="inline-flex items-center gap-0.5 rounded px-1 py-0.5 text-[10px] text-slate-500 hover:bg-white/5 hover:text-slate-300">
          <Plus className="size-2.5" /> transform
        </button>
      )}
    </div>
  )
}

function ValueMapEditor({ def, spec, rawValues, onChange }) {
  const map = spec.valueMap ?? {}
  const keys = [...new Set([...rawValues.map(String), ...Object.keys(map)])].filter((k) => k !== '')
  if (!keys.length) return <p className="text-[11px] text-slate-500">Pick a source field to map its values.</p>
  return (
    <div className="mt-2 rounded-lg bg-slate-950/50 p-2 ring-1 ring-white/5">
      <p className="mb-1.5 text-[10px] tracking-wider text-slate-500 uppercase">Value map · source → VRR</p>
      <div className="grid gap-1">
        {keys.map((k) => (
          <div key={k} className="grid grid-cols-[1fr_auto_9rem] items-center gap-2">
            <span className="truncate font-mono text-[11px] text-slate-300" title={k}>
              {k}
            </span>
            <ArrowRight className="size-3 text-slate-600" />
            <select
              value={map[k] ?? ''}
              onChange={(e) => {
                const next = { ...map }
                if (e.target.value) next[k] = e.target.value
                else delete next[k]
                onChange({ ...spec, valueMap: next })
              }}
              className={cx(inputCls, 'py-1', !map[k] && !def.values.includes(k) && 'ring-amber-400/40')}
            >
              <option value="">{def.values.includes(k) ? `(same: ${k})` : '— unmapped —'}</option>
              {def.values.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </div>
        ))}
      </div>
    </div>
  )
}

function FieldRow({ name, def, spec = {}, paths, onChange }) {
  const discovered = paths.find((p) => p.path === spec.source)
  const useConstant = spec.value !== undefined
  const confidence = spec.confidence
  const filled = spec.source || (useConstant && spec.value !== '') || (spec.default ?? '') !== ''

  return (
    <div className="grid gap-2 border-t border-white/5 py-3 lg:grid-cols-[11rem_minmax(0,1fr)_minmax(0,1fr)]">
      <div>
        <p className="flex items-center gap-1.5 text-sm text-slate-100">
          {def.label}
          {def.required && <span className="text-rose-400">*</span>}
        </p>
        <p className="font-mono text-[10px] text-slate-500">
          {name} · {def.type === 'enum' ? def.values.join(' | ') : def.type}
        </p>
      </div>

      <div className="space-y-1.5">
        <div className="flex gap-1.5">
          {useConstant ? (
            <input value={spec.value} onChange={(e) => onChange({ ...spec, value: e.target.value })} placeholder="constant value" className={inputCls} />
          ) : (
            <select
              value={spec.source ?? ''}
              onChange={(e) => {
                const { confidence: _c, ...rest } = spec
                onChange({ ...rest, source: e.target.value || undefined })
              }}
              className={cx(inputCls, def.required && !filled && 'ring-rose-400/40')}
            >
              <option value="">— not mapped —</option>
              {paths.map((p) => (
                <option key={p.path} value={p.path}>
                  {p.path}
                  {p.samples[0] !== undefined ? `  ·  ${String(p.samples[0]).slice(0, 28)}` : ''}
                </option>
              ))}
              {spec.source && !paths.some((p) => p.path === spec.source) && <option value={spec.source}>{spec.source} (not in sample)</option>}
            </select>
          )}
          <button
            type="button"
            title={useConstant ? 'Map from a source field' : 'Use a constant value'}
            onClick={() => {
              const { value: _v, source: _s, ...rest } = spec
              onChange(useConstant ? rest : { ...rest, value: '' })
            }}
            className="shrink-0 rounded-md px-2 text-[10px] text-slate-500 ring-1 ring-white/10 hover:text-slate-200"
          >
            {useConstant ? 'field' : 'const'}
          </button>
        </div>
        <TransformChips value={spec.transforms} onChange={(transforms) => onChange({ ...spec, transforms })} />
        {def.type === 'enum' && <ValueMapEditor def={def} spec={spec} rawValues={discovered?.values ?? discovered?.samples ?? []} onChange={onChange} />}
      </div>

      <div className="space-y-1.5 text-[11px]">
        {discovered ? (
          <p className="truncate text-slate-400" title={discovered.samples.join(' · ')}>
            <span className="text-slate-500">e.g. </span>
            <span className="font-mono text-slate-300">{discovered.samples.slice(0, 2).map(String).join(' · ') || '(empty)'}</span>
            <span className="ml-1 text-slate-600">{Math.round(discovered.filled * 100)}% filled</span>
          </p>
        ) : spec.source ? (
          <p className="text-amber-300/80">Path not seen in sample records</p>
        ) : null}
        {confidence != null && <p className="text-cyan-300/70">auto-suggested · {Math.round(confidence * 100)}% match</p>}
        <input
          value={spec.default ?? ''}
          onChange={(e) => onChange({ ...spec, default: e.target.value || undefined })}
          placeholder={def.defaultValue ? `default: ${def.defaultValue}` : 'fallback when empty (optional)'}
          className={cx(inputCls, 'py-1')}
        />
      </div>
    </div>
  )
}

function Preview({ result, entity }) {
  if (!result) return null
  const fields = Object.keys(TARGET_SCHEMA[entity].fields)
  return (
    <div className="mt-4 rounded-xl bg-slate-950/50 p-3 ring-1 ring-white/5">
      <div className="mb-2 flex flex-wrap items-center gap-3 text-xs">
        <span className="inline-flex items-center gap-1 text-emerald-300">
          <CircleCheck className="size-3.5" /> {result.rows.length} of {result.sampleSize} sample rows valid
        </span>
        {result.rejected.length > 0 && (
          <span className="inline-flex items-center gap-1 text-rose-300">
            <CircleAlert className="size-3.5" /> {result.rejected.length} rejected
          </span>
        )}
        {entity !== 'accounts' && result.unmatched > 0 && <span className="text-amber-300">{result.unmatched} with no matching synced account (sync Accounts first, or change account matching)</span>}
        {Object.entries(result.unmappedValues ?? {}).map(([f, vals]) => (
          <span key={f} className="text-amber-300">
            Unmapped {f}: {Object.keys(vals).join(', ')}
          </span>
        ))}
      </div>
      {result.rows.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full font-mono text-[11px]">
            <thead>
              <tr className="text-left text-slate-500">
                {fields.map((f) => (
                  <th key={f} className="px-2 py-1 font-normal whitespace-nowrap">
                    {f}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {result.rows.slice(0, 6).map((r, i) => (
                <tr key={i} className="border-t border-white/5 text-slate-300">
                  {fields.map((f) => (
                    <td key={f} className="max-w-48 truncate px-2 py-1 whitespace-nowrap">
                      {r[f] === null || r[f] === undefined ? <span className="text-slate-600">null</span> : String(r[f])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {result.rejected.slice(0, 3).map((r) => (
        <p key={r.index} className="mt-1 text-[11px] text-rose-300/80">
          Row {r.index + 1}: {r.reasons.join('; ')}
        </p>
      ))}
    </div>
  )
}

export function MappingEditor({ api, connection, streams, sampleSize, onSaved }) {
  const [entity, setEntity] = useState('accounts')
  const [draft, setDraft] = useState(() => {
    const m = structuredClone(connection.mapping ?? {})
    for (const e of ENTITY_ORDER) m[e] = { ...emptyEntity(), ...m[e] }
    return m
  })
  const [previewState, setPreviewState] = useState(null)
  const [actionError, setActionError] = useState(null)
  const [busy, setBusy] = useState(null)
  const [saved, setSaved] = useState(false)

  const current = draft[entity]
  const schema = TARGET_SCHEMA[entity]
  const problems = useMemo(() => (current.enabled ? validateMapping(entity, current) : []), [entity, current])
  const dirty = JSON.stringify(draft) !== JSON.stringify(connection.mapping)

  const update = (patch) => {
    setDraft((d) => ({ ...d, [entity]: { ...d[entity], ...patch } }))
    setSaved(false)
  }
  const setField = (name, spec) => update({ fields: { ...current.fields, [name]: spec } })

  // Sample records for the selected stream (keyed so stale responses are ignored).
  const sampleKey = `${entity}|${current.stream}|${sampleSize}`
  const [sample, setSample] = useState({ key: null, paths: [], error: null })
  useEffect(() => {
    if (!current.stream) return
    let cancelled = false
    api.connections
      .sample(connection.id, current.stream, sampleSize)
      .then((r) => !cancelled && setSample({ key: sampleKey, paths: r.paths, error: null }))
      .catch((e) => !cancelled && setSample({ key: sampleKey, paths: [], error: e.message }))
    return () => {
      cancelled = true
    }
  }, [api, connection.id, current.stream, sampleSize, sampleKey])
  const sampleReady = sample.key === sampleKey
  const paths = current.stream && sampleReady ? sample.paths : []
  const loadingSample = Boolean(current.stream) && !sampleReady
  const sampleError = actionError ?? (sampleReady ? sample.error : null)
  const preview = previewState?.key === sampleKey ? previewState.result : null

  const suggest = async () => {
    setBusy('suggest')
    try {
      const { fields } = await api.connections.suggest(connection.id, entity, current.stream)
      // Keep anything the user already mapped; fill the gaps.
      const merged = { ...fields }
      for (const [k, v] of Object.entries(current.fields)) if (v?.source || v?.value !== undefined) merged[k] = v
      update({ fields: merged, enabled: true })
    } catch (e) {
      setActionError(e.message)
    } finally {
      setBusy(null)
    }
  }

  const runPreview = async () => {
    setBusy('preview')
    try {
      setActionError(null)
      setPreviewState({ key: sampleKey, result: await api.connections.preview(connection.id, entity, current) })
    } catch (e) {
      setActionError(e.message)
    } finally {
      setBusy(null)
    }
  }

  const save = async () => {
    setBusy('save')
    try {
      // Strip UI-only hints before persisting.
      const clean = Object.fromEntries(
        Object.entries(draft).map(([e, m]) => [e, { ...m, fields: Object.fromEntries(Object.entries(m.fields).map(([f, { confidence: _c, ...spec }]) => [f, spec])) }]),
      )
      const updated = await api.connections.update(connection.id, { mapping: clean })
      setSaved(true)
      onSaved(updated)
    } finally {
      setBusy(null)
    }
  }

  return (
    <Panel className="p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-mono text-[10px] tracking-[0.25em] text-cyan-300/70 uppercase">Field mapping</p>
          <h3 className="mt-1 text-base font-semibold text-slate-100">Map {connection.name} → VRR</h3>
        </div>
        <div className="flex items-center gap-2">
          {saved && !dirty && <span className="text-xs text-emerald-300">Saved</span>}
          <ActionButton size="sm" icon={busy === 'save' ? LoaderCircle : Save} onClick={save} disabled={!dirty || busy === 'save'}>
            Save mapping
          </ActionButton>
        </div>
      </div>

      {/* Entity tabs */}
      <div className="mb-4 flex flex-wrap gap-1.5">
        {ENTITY_ORDER.map((e) => {
          const m = draft[e]
          const ok = m.enabled && !validateMapping(e, m).length
          return (
            <button
              key={e}
              type="button"
              onClick={() => setEntity(e)}
              className={cx(
                'inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs ring-1 transition',
                entity === e ? 'bg-cyan-400/10 text-cyan-100 ring-cyan-400/40' : 'text-slate-400 ring-white/10 hover:text-slate-200',
              )}
            >
              <span className={cx('size-1.5 rounded-full', ok ? 'bg-emerald-400' : m.enabled ? 'bg-amber-400' : 'bg-slate-600')} />
              {TARGET_SCHEMA[e].label}
            </button>
          )
        })}
      </div>

      <p className="mb-4 text-xs text-slate-500">{schema.description}</p>

      <div className="mb-4 grid gap-3 rounded-xl bg-slate-950/40 p-3 ring-1 ring-white/5 md:grid-cols-[auto_1fr_1fr_1fr]">
        <label className="flex items-center gap-2 text-xs text-slate-300">
          <input type="checkbox" checked={current.enabled} onChange={(e) => update({ enabled: e.target.checked })} className="size-4 accent-cyan-400" />
          Sync {schema.label.toLowerCase()}
        </label>
        <label className="text-[11px] text-slate-400">
          Source object / stream
          <select value={current.stream} onChange={(e) => update({ stream: e.target.value })} className={cx(inputCls, 'mt-1')}>
            <option value="">— choose —</option>
            {streams.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        {entity !== 'accounts' ? (
          <label className="text-[11px] text-slate-400">
            Match account by
            <select value={current.accountMatch} onChange={(e) => update({ accountMatch: e.target.value })} className={cx(inputCls, 'mt-1')}>
              {ACCOUNT_MATCH.map((m) => (
                <option key={m.value} value={m.value} title={m.help}>
                  {m.label}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <div />
        )}
        <label className="text-[11px] text-slate-400">
          Sync mode
          <select value={current.syncMode ?? 'incremental'} onChange={(e) => update({ syncMode: e.target.value })} className={cx(inputCls, 'mt-1')}>
            <option value="incremental">Incremental (changes since last pull)</option>
            <option value="full">Full refresh (remove rows no longer in source)</option>
          </select>
        </label>
      </div>

      {current.stream && (
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <ActionButton size="sm" tone="ghost" icon={busy === 'suggest' ? LoaderCircle : WandSparkles} onClick={suggest} disabled={busy === 'suggest' || loadingSample}>
            Auto-map fields
          </ActionButton>
          <ActionButton size="sm" tone="ghost" icon={busy === 'preview' ? LoaderCircle : Eye} onClick={runPreview} disabled={busy === 'preview'}>
            Preview with sample
          </ActionButton>
          <ActionButton size="sm" tone="ghost" icon={Trash2} onClick={() => update({ fields: {} })}>
            Clear
          </ActionButton>
          <span className="text-[11px] text-slate-500">{loadingSample ? 'Reading sample records…' : `${paths.length} source fields discovered`}</span>
        </div>
      )}
      {sampleError && <p className="mb-2 rounded-lg bg-rose-500/10 px-3 py-2 text-xs text-rose-200 ring-1 ring-rose-500/30">{sampleError}</p>}

      {current.stream ? (
        <div>
          {Object.entries(schema.fields).map(([name, def]) => (
            <FieldRow key={name} name={name} def={def} spec={current.fields[name]} paths={paths} onChange={(spec) => setField(name, spec)} />
          ))}
        </div>
      ) : (
        <p className="py-8 text-center text-sm text-slate-500">Choose the source object that holds {schema.label.toLowerCase()}.</p>
      )}

      {problems.length > 0 && (
        <p className="mt-3 text-xs text-amber-300">
          <CircleAlert className="mr-1 inline size-3.5" />
          {problems.join(' · ')}
        </p>
      )}
      <Preview result={preview} entity={entity} />
    </Panel>
  )
}
