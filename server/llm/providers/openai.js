import { request } from '../../lib/fetch.js'
import { readSse } from '../sse.js'

// OpenAI Chat Completions — also covers Azure OpenAI proxies, Ollama, vLLM,
// LM Studio, OpenRouter and any other OpenAI-compatible endpoint.

function authHeaders(cfg, token) {
  if (!token) return {}
  if (cfg.auth === 'api-key') return { 'api-key': token }
  return { authorization: `Bearer ${token}` }
}

function toMessages(system, messages) {
  const out = system ? [{ role: 'system', content: system }] : []
  for (const m of messages) {
    if (m.role === 'assistant') {
      const msg = { role: 'assistant', content: m.content || null }
      if (m.toolCalls?.length) msg.tool_calls = m.toolCalls.map((c) => ({ id: c.id, type: 'function', function: { name: c.name, arguments: JSON.stringify(c.args ?? {}) } }))
      out.push(msg)
    } else if (m.role === 'tool') out.push({ role: 'tool', tool_call_id: m.toolCallId, content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content) })
    else out.push({ role: 'user', content: m.content })
  }
  return out
}

function body(cfg, { system, messages, tools, model }, stream) {
  // o-series / gpt-5 reasoning models reject temperature and use max_completion_tokens.
  const reasoning = /^(o\d|gpt-5)/.test(model)
  const out = { model, messages: toMessages(system, messages) }
  if (reasoning) out.max_completion_tokens = cfg.maxOutputTokens ?? 2048
  else {
    out.temperature = cfg.temperature ?? 0.2
    out.max_tokens = cfg.maxOutputTokens ?? 2048
  }
  if (tools?.length) out.tools = tools.map((t) => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.parameters } }))
  if (stream) {
    out.stream = true
    out.stream_options = { include_usage: true }
  }
  return out
}

const parseArgs = (s) => {
  try {
    return s ? JSON.parse(s) : {}
  } catch {
    return {}
  }
}

export const openai = {
  async chat(cfg, token, req) {
    const model = req.model ?? cfg.model
    const { data } = await request(`${cfg.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: authHeaders(cfg, token),
      body: body(cfg, { ...req, model }, false),
      timeoutMs: 90_000,
      retries: 2,
    })
    const msg = data.choices?.[0]?.message ?? {}
    return {
      text: msg.content ?? '',
      toolCalls: (msg.tool_calls ?? []).map((c) => ({ id: c.id, name: c.function.name, args: parseArgs(c.function.arguments) })),
      finishReason: data.choices?.[0]?.finish_reason,
      usage: data.usage ? { input: data.usage.prompt_tokens, output: data.usage.completion_tokens } : null,
      model: data.model ?? model,
    }
  },

  async *stream(cfg, token, req) {
    const model = req.model ?? cfg.model
    const res = await fetch(`${cfg.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...authHeaders(cfg, token) },
      body: JSON.stringify(body(cfg, { ...req, model }, true)),
      signal: req.signal ?? AbortSignal.timeout(120_000),
    })
    if (!res.ok) throw new Error(`OpenAI-compatible endpoint ${res.status}: ${(await res.text()).slice(0, 300)}`)
    const calls = new Map()
    let usage = null
    let finishReason = null
    for await (const data of readSse(res.body)) {
      if (data.usage) usage = { input: data.usage.prompt_tokens, output: data.usage.completion_tokens }
      const choice = data.choices?.[0]
      if (!choice) continue
      if (choice.delta?.content) yield { type: 'text', text: choice.delta.content }
      for (const tc of choice.delta?.tool_calls ?? []) {
        const c = calls.get(tc.index) ?? { id: tc.id, name: '', args: '' }
        if (tc.id) c.id = tc.id
        if (tc.function?.name) c.name += tc.function.name
        if (tc.function?.arguments) c.args += tc.function.arguments
        calls.set(tc.index, c)
      }
      finishReason = choice.finish_reason ?? finishReason
    }
    yield { type: 'done', toolCalls: [...calls.values()].map((c) => ({ id: c.id, name: c.name, args: parseArgs(c.args) })), usage, finishReason, model }
  },

  async listModels(cfg, token) {
    const { data } = await request(`${cfg.baseUrl}/models`, { headers: authHeaders(cfg, token), retries: 1, timeoutMs: 15_000 })
    return (data.data ?? []).map((m) => m.id)
  },
}
