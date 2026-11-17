import { useState } from 'react'
import { KeyRound } from 'lucide-react'
import { cx } from '@core'

// Renders any connector's settings from its field schema (server/connectors/*.js).
// Secret fields are write-only: the server reports which are set, never their values.

const isVisible = (field, values, fields) => {
  if (!field.showIf) return true
  const dep = fields.find((f) => f.key === field.showIf.key)
  return field.showIf.in.includes(values[field.showIf.key] ?? dep?.default)
}

const inputCls = 'w-full rounded-lg bg-slate-950/60 px-3 py-2 text-sm text-slate-100 ring-1 ring-white/10 outline-none placeholder:text-slate-600 focus:ring-cyan-400/50'

function Field({ field, value, onChange, secretSet }) {
  const common = { id: `f-${field.key}`, className: inputCls, placeholder: field.placeholder }
  switch (field.type) {
    case 'select':
      return (
        <select {...common} value={value ?? field.default ?? ''} onChange={(e) => onChange(e.target.value)}>
          {field.options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      )
    case 'password':
      return (
        <div className="relative">
          <input
            {...common}
            type="password"
            autoComplete="new-password"
            value={value ?? ''}
            placeholder={secretSet ? '•••••••• (saved — type to replace)' : field.placeholder}
            onChange={(e) => onChange(e.target.value)}
          />
          {secretSet && !value && <KeyRound className="absolute top-1/2 right-3 size-3.5 -translate-y-1/2 text-emerald-400" />}
        </div>
      )
    case 'textarea':
      return <textarea {...common} rows={3} value={value ?? ''} onChange={(e) => onChange(e.target.value)} className={cx(inputCls, 'font-mono text-xs')} />
    case 'json':
      return (
        <textarea
          {...common}
          rows={Math.min(12, Math.max(3, String(value ?? '').split('\n').length))}
          value={typeof value === 'string' ? value : JSON.stringify(value ?? field.default ?? null, null, 2)}
          onChange={(e) => onChange(e.target.value)}
          spellCheck={false}
          className={cx(inputCls, 'font-mono text-xs')}
        />
      )
    case 'boolean':
      return <input type="checkbox" checked={Boolean(value ?? field.default)} onChange={(e) => onChange(e.target.checked)} className="size-4 accent-cyan-400" />
    case 'number':
      return <input {...common} type="number" value={value ?? field.default ?? ''} onChange={(e) => onChange(e.target.value)} />
    default:
      return <input {...common} type={field.type === 'url' ? 'url' : 'text'} value={value ?? field.default ?? ''} onChange={(e) => onChange(e.target.value)} />
  }
}

export function ConnectorForm({ connector, values, onChange, secretsSet = [], showAdvanced: showAdvancedDefault = false }) {
  const [showAdvanced, setShowAdvanced] = useState(showAdvancedDefault)
  const visible = connector.fields.filter((f) => isVisible(f, values, connector.fields))
  const basic = visible.filter((f) => !f.advanced)
  const advanced = visible.filter((f) => f.advanced)
  const set = (key) => (v) => onChange({ ...values, [key]: v })

  const render = (f) => (
    <div key={f.key} className={cx(f.type === 'json' || f.type === 'textarea' ? 'sm:col-span-2' : '')}>
      <label htmlFor={`f-${f.key}`} className="mb-1 flex items-center gap-1 text-xs text-slate-400">
        {f.label}
        {f.required && <span className="text-rose-400">*</span>}
        {f.secret && <span className="ml-1 rounded bg-white/5 px-1 text-[9px] tracking-wider text-slate-500 uppercase">encrypted</span>}
      </label>
      <Field field={f} value={values[f.key]} onChange={set(f.key)} secretSet={secretsSet.includes(f.key)} />
      {f.help && <p className="mt-1 text-[11px] text-slate-500">{f.help}</p>}
    </div>
  )

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">{basic.map(render)}</div>
      {advanced.length > 0 && (
        <div>
          <button type="button" onClick={() => setShowAdvanced((s) => !s)} className="text-xs text-slate-400 underline-offset-2 hover:text-slate-200 hover:underline">
            {showAdvanced ? 'Hide' : 'Show'} advanced settings ({advanced.length})
          </button>
          {showAdvanced && <div className="mt-3 grid gap-4 sm:grid-cols-2">{advanced.map(render)}</div>}
        </div>
      )}
    </div>
  )
}

