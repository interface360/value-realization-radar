import { useCallback, useEffect, useRef, useState } from 'react'
import { useDataContext } from '@core'
import { DEFAULT_SERVER_URL } from '../../../core/tenancy/session.js'
import { db } from '../../../core/db/schema.js'

// Chat state + SSE client for POST /api/assistant/chat.

async function localSnapshot() {
  const [accounts, telemetry, projects, interventions, usage] = await Promise.all([
    db.accounts.toArray(),
    db.telemetry.toArray(),
    db.projects.toArray(),
    db.interventions.toArray(),
    db.usage.toArray(),
  ])
  return { accounts, telemetry, projects, interventions, usage }
}

async function* readEvents(res) {
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    let i
    while ((i = buffer.indexOf('\n\n')) >= 0) {
      const frame = buffer.slice(0, i)
      buffer = buffer.slice(i + 2)
      const data = frame
        .split('\n')
        .filter((l) => l.startsWith('data:'))
        .map((l) => l.slice(5).trimStart())
        .join('\n')
      if (data) yield JSON.parse(data)
    }
  }
}

export function useAssistant({ useDataTools }) {
  const { provider: dataProvider, workspace } = useDataContext()
  const serverUrl = workspace.mode === 'server' ? workspace.serverUrl : DEFAULT_SERVER_URL
  const apiKey = workspace.mode === 'server' ? workspace.apiKey : null
  const [messages, setMessages] = useState([])
  const [busy, setBusy] = useState(false)
  const [providers, setProviders] = useState(null)
  const [providersError, setProvidersError] = useState(null)
  const [choice, setChoice] = useState({ provider: null, model: null })
  const abortRef = useRef(null)

  // Reset the conversation when the workspace changes.
  const key = `${serverUrl}|${apiKey ?? 'local'}`
  const [seenKey, setSeenKey] = useState(key)
  if (key !== seenKey) {
    setSeenKey(key)
    setMessages([])
  }

  useEffect(() => {
    let cancelled = false
    fetch(`${serverUrl}/api/assistant/providers`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`${r.status}`))))
      .then((p) => !cancelled && (setProviders(p), setProvidersError(null)))
      .catch(() => !cancelled && (setProviders(null), setProvidersError(`Can't reach the sync server at ${serverUrl}. The assistant runs there — start it with npm run server.`)))
    return () => {
      cancelled = true
    }
  }, [serverUrl])

  const patchLast = (fn) => setMessages((list) => list.map((m, i) => (i === list.length - 1 ? fn(m) : m)))

  const send = useCallback(
    async (text) => {
      const question = text.trim()
      if (!question || busy) return
      const history = [...messages.filter((m) => !m.error), { role: 'user', content: question }]
      setMessages([...history, { role: 'assistant', content: '', tools: [], sources: [], pending: true }])
      setBusy(true)
      const controller = new AbortController()
      abortRef.current = controller
      try {
        const body = {
          messages: history.map(({ role, content }) => ({ role, content })),
          provider: choice.provider ?? undefined,
          model: choice.model ?? undefined,
          useDataTools,
        }
        if (dataProvider.kind === 'local' && useDataTools) body.snapshot = await localSnapshot()
        const res = await fetch(`${serverUrl}/api/assistant/chat`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}) },
          body: JSON.stringify(body),
          signal: controller.signal,
        })
        if (!res.ok || !res.headers.get('content-type')?.includes('text/event-stream')) {
          const err = await res.json().catch(() => ({}))
          throw new Error(err.error ?? `Assistant request failed (${res.status})`)
        }
        for await (const ev of readEvents(res)) {
          if (ev.type === 'text') patchLast((m) => ({ ...m, content: m.content + ev.text }))
          else if (ev.type === 'tool') patchLast((m) => ({ ...m, tools: [...m.tools, ev] }))
          else if (ev.type === 'sources') patchLast((m) => ({ ...m, sources: ev.docs }))
          else if (ev.type === 'start') patchLast((m) => ({ ...m, provider: ev.provider, model: ev.model }))
          else if (ev.type === 'done') patchLast((m) => ({ ...m, usage: ev.usage }))
          else if (ev.type === 'error') throw new Error(ev.message)
        }
        patchLast((m) => ({ ...m, pending: false }))
      } catch (e) {
        if (controller.signal.aborted) patchLast((m) => ({ ...m, pending: false, stopped: true }))
        else patchLast((m) => ({ ...m, pending: false, error: e.message }))
      } finally {
        setBusy(false)
        abortRef.current = null
      }
    },
    [busy, messages, choice, useDataTools, dataProvider.kind, serverUrl, apiKey],
  )

  return {
    messages,
    busy,
    send,
    stop: () => abortRef.current?.abort(),
    clear: () => setMessages([]),
    providers,
    providersError,
    choice,
    setChoice,
    workspaceLabel: workspace.mode === 'server' ? workspace.tenant.name : 'Local demo',
  }
}
