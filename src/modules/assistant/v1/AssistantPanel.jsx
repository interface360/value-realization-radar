import { useEffect, useRef, useState } from 'react'
import { Bot, CircleAlert, CircleStop, Copy, Eraser, FileText, Send, Sparkles, Wrench, X } from 'lucide-react'
import { cx, Markdown, useModules, useWorkspace } from '@core'
import { useAssistant } from './useAssistant.js'

const SUGGESTIONS = [
  'Which danger-zone accounts have no intervention yet?',
  'What blocker is stalling the most ARR?',
  'Summarize our top 3 stalled accounts for a QBR.',
  'How is "ARR at risk" calculated?',
  'How do I map Salesforce contracts to renewal date?',
  'How do I switch the assistant to another LLM?',
]

function ProviderPicker({ providers, choice, setChoice }) {
  const configured = providers.providers.filter((p) => p.configured)
  const current = configured.find((p) => p.id === (choice.provider ?? providers.defaultProvider)) ?? configured[0]
  if (!current) return null
  return (
    <div className="flex min-w-0 items-center gap-1.5">
      <select
        value={current.id}
        onChange={(e) => setChoice({ provider: e.target.value, model: null })}
        aria-label="LLM provider"
        className="min-w-0 max-w-44 truncate rounded-md bg-slate-950/60 px-2 py-1 text-[11px] text-slate-200 ring-1 ring-white/10 outline-none"
      >
        {providers.providers.map((p) => (
          <option key={p.id} value={p.id} disabled={!p.configured}>
            {p.label}
            {p.configured ? '' : ' (no token)'}
          </option>
        ))}
      </select>
      <select
        value={choice.model ?? current.model}
        onChange={(e) => setChoice({ provider: current.id, model: e.target.value })}
        aria-label="Model"
        className="min-w-0 max-w-40 shrink-0 rounded-md bg-slate-950/60 px-2 py-1 font-mono text-[11px] text-slate-200 ring-1 ring-white/10 outline-none"
      >
        {[...new Set([current.model, ...current.models])].map((m) => (
          <option key={m} value={m}>
            {m}
          </option>
        ))}
      </select>
    </div>
  )
}

function Message({ m, onDocLink, onAccountLink }) {
  const [copied, setCopied] = useState(false)
  if (m.role === 'user') {
    return (
      <div className="flex justify-end">
        <p className="max-w-[85%] rounded-2xl rounded-br-md bg-cyan-400/15 px-3.5 py-2 text-sm whitespace-pre-wrap text-cyan-50 ring-1 ring-cyan-400/25">{m.content}</p>
      </div>
    )
  }
  return (
    <div className="flex gap-2.5">
      <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg bg-violet-400/15 text-violet-200 ring-1 ring-violet-400/30">
        <Bot className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        {m.tools?.length > 0 && (
          <div className="mb-1.5 flex flex-wrap gap-1">
            {m.tools.map((t, i) => (
              <span key={i} className="inline-flex items-center gap-1 rounded bg-white/5 px-1.5 py-0.5 font-mono text-[10px] text-slate-400" title={JSON.stringify(t.args)}>
                <Wrench className="size-2.5" /> {t.summary}
              </span>
            ))}
          </div>
        )}
        {m.content ? (
          <Markdown compact onDocLink={onDocLink} onAccountLink={onAccountLink} className="text-slate-200">
            {m.content}
          </Markdown>
        ) : m.pending ? (
          <p className="flex items-center gap-1.5 py-1 text-sm text-slate-500">
            <span className="size-1.5 animate-pulse rounded-full bg-violet-300" />
            <span className="size-1.5 animate-pulse rounded-full bg-violet-300 [animation-delay:150ms]" />
            <span className="size-1.5 animate-pulse rounded-full bg-violet-300 [animation-delay:300ms]" />
          </p>
        ) : null}
        {m.error && (
          <p className="mt-1 flex items-start gap-1.5 rounded-lg bg-rose-500/10 px-2.5 py-2 text-xs text-rose-200 ring-1 ring-rose-500/30">
            <CircleAlert className="mt-0.5 size-3.5 shrink-0" />
            {m.error}
          </p>
        )}
        {m.stopped && <p className="mt-1 text-[11px] text-slate-500">Stopped.</p>}
        {!m.pending && !m.error && m.content && (
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-slate-500">
            {m.sources?.slice(0, 3).map((s) => (
              <button key={`${s.slug}#${s.anchor}`} type="button" onClick={() => onDocLink(s.slug, s.anchor)} className="inline-flex items-center gap-1 hover:text-cyan-300">
                <FileText className="size-2.5" /> {s.title} › {s.heading}
              </button>
            ))}
            <span className="ml-auto font-mono">{m.model}</span>
            <button
              type="button"
              onClick={() => navigator.clipboard?.writeText(m.content).then(() => (setCopied(true), setTimeout(() => setCopied(false), 1200)))}
              className="inline-flex items-center gap-1 hover:text-slate-300"
            >
              <Copy className="size-2.5" /> {copied ? 'copied' : 'copy'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

export default function AssistantPanel({ options }) {
  const { openPanel, closePanel, openAccount, openDoc, isEnabled } = useWorkspace()
  const { isEnabled: moduleEnabled } = useModules()
  const open = openPanel === 'assistant'
  const a = useAssistant({ useDataTools: options.useDataTools })
  const [input, setInput] = useState('')
  const listRef = useRef(null)
  const inputRef = useRef(null)

  useEffect(() => {
    if (open) inputRef.current?.focus()
  }, [open])
  useEffect(() => {
    const el = listRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [a.messages])
  useEffect(() => {
    if (!open) return
    const onKey = (e) => e.key === 'Escape' && closePanel()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, closePanel])

  if (!open) return null

  const submit = (text) => {
    a.send(text ?? input)
    setInput('')
  }
  const onDocLink = (page, anchor) => {
    if (moduleEnabled('docs')) openDoc(page, anchor)
  }
  const onAccountLink = isEnabled('intervention-drawer') ? openAccount : undefined
  const noProvider = a.providers && !a.providers.providers.some((p) => p.configured)

  return (
    <aside
      role="dialog"
      aria-label="VRR Assistant"
      className="animate-drawer-in fixed top-0 right-0 z-30 flex h-full w-full max-w-[460px] flex-col border-l border-white/10 bg-slate-900/80 shadow-[-24px_0_80px_-20px_rgba(0,0,0,0.8)] backdrop-blur-2xl"
    >
      <div className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-[radial-gradient(ellipse_at_top_right,rgba(167,139,250,0.18),transparent_70%)]" />
      <header className="relative flex items-start justify-between gap-3 border-b border-white/5 px-4 py-3">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-sm font-semibold text-slate-50">
            <Sparkles className="size-4 text-violet-300" /> VRR Assistant
          </p>
          <p className="truncate text-[11px] text-slate-500">
            {a.workspaceLabel} · {options.useDataTools ? 'docs + live portfolio' : 'docs only'} · read-only
          </p>
        </div>
        <div className="flex items-center gap-1">
          {a.messages.length > 0 && (
            <button type="button" onClick={a.clear} title="New conversation" className="rounded-lg p-1.5 text-slate-400 hover:bg-white/10 hover:text-slate-100">
              <Eraser className="size-4" />
            </button>
          )}
          <button type="button" onClick={closePanel} aria-label="Close assistant" className="rounded-lg p-1.5 text-slate-400 hover:bg-white/10 hover:text-slate-100">
            <X className="size-5" />
          </button>
        </div>
      </header>

      {options.allowProviderSwitch && a.providers && !noProvider && (
        <div className="relative flex min-w-0 items-center justify-between gap-2 border-b border-white/5 px-4 py-2">
          <span className="text-[10px] tracking-wider text-slate-500 uppercase">Model</span>
          <ProviderPicker providers={a.providers} choice={a.choice} setChoice={a.setChoice} />
        </div>
      )}

      <div ref={listRef} className="relative flex-1 space-y-4 overflow-y-auto px-4 py-4">
        {a.providersError && <p className="rounded-lg bg-amber-400/10 px-3 py-2 text-xs text-amber-200 ring-1 ring-amber-400/30">{a.providersError}</p>}
        {noProvider && (
          <p className="rounded-lg bg-amber-400/10 px-3 py-2 text-xs text-amber-200 ring-1 ring-amber-400/30">
            No LLM provider is configured on the server. Add <code>VRR_GEMINI_TOKEN</code> or <code>VRR_OPENAI_TOKEN</code> to <code>.env.local</code> and restart{' '}
            <code>npm run server</code>.{' '}
            {moduleEnabled('docs') && (
              <button type="button" onClick={() => onDocLink('ASSISTANT', 'quick-setup')} className="underline">
                Setup guide
              </button>
            )}
          </p>
        )}

        {a.messages.length === 0 && !a.providersError && !noProvider && (
          <div className="pt-6">
            <p className="text-center text-sm text-slate-300">Ask about your portfolio or how VRR works.</p>
            <p className="mt-1 text-center text-[11px] text-slate-500">Answers cite docs and accounts. Click a citation to open it.</p>
            {options.suggestions && (
              <div className="mt-5 grid gap-1.5">
                {SUGGESTIONS.map((s) => (
                  <button key={s} type="button" onClick={() => submit(s)} className="rounded-lg bg-white/[0.03] px-3 py-2 text-left text-xs text-slate-300 ring-1 ring-white/5 transition hover:bg-white/[0.06] hover:text-slate-100">
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {a.messages.map((m, i) => (
          <Message key={i} m={m} onDocLink={onDocLink} onAccountLink={onAccountLink} />
        ))}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
        className="relative border-t border-white/5 p-3"
      >
        <div className="flex items-end gap-2 rounded-xl bg-slate-950/60 p-1.5 ring-1 ring-white/10 focus-within:ring-violet-400/50">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                submit()
              }
            }}
            rows={Math.min(5, Math.max(1, input.split('\n').length))}
            placeholder="Ask anything… (Enter to send, Shift+Enter for a new line)"
            aria-label="Message"
            disabled={Boolean(a.providersError) || noProvider}
            className="max-h-32 min-h-9 flex-1 resize-none bg-transparent px-2 py-1.5 text-sm text-slate-100 outline-none placeholder:text-slate-600"
          />
          {a.busy ? (
            <button type="button" onClick={a.stop} aria-label="Stop" className="grid size-9 place-items-center rounded-lg bg-white/10 text-slate-200 hover:bg-white/15">
              <CircleStop className="size-4" />
            </button>
          ) : (
            <button
              type="submit"
              disabled={!input.trim() || Boolean(a.providersError) || noProvider}
              aria-label="Send"
              className={cx('grid size-9 place-items-center rounded-lg transition', input.trim() ? 'bg-violet-400/25 text-violet-50 hover:bg-violet-400/35' : 'bg-white/5 text-slate-600')}
            >
              <Send className="size-4" />
            </button>
          )}
        </div>
        <p className="mt-1.5 px-1 text-[10px] text-slate-600">AI can make mistakes. Check numbers against the radar before acting.</p>
      </form>
    </aside>
  )
}
