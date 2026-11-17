import { request } from '../../lib/fetch.js'
import { readSse } from '../sse.js'

// Google Gemini (generateContent / streamGenerateContent). Works against the
// public API or a proxy that accepts Bearer / x-goog-api-key auth.

const authHeaders = (cfg, token) => (cfg.auth === 'x-goog-api-key' ? { 'x-goog-api-key': token } : { authorization: `Bearer ${token}` })

// Normalised messages → Gemini contents.
function toContents(messages) {
  const contents = []
  for (const m of messages) {
    if (m.role === 'user') contents.push({ role: 'user', parts: [{ text: m.content }] })
    else if (m.role === 'assistant') {
      const parts = []
      if (m.content) parts.push({ text: m.content })
      for (const c of m.toolCalls ?? []) parts.push({ functionCall: { name: c.name, args: c.args } })
      contents.push({ role: 'model', parts })
    } else if (m.role === 'tool') {
      // Consecutive tool results share one user turn.
      const part = { functionResponse: { name: m.name, response: { result: m.content } } }
      const last = contents.at(-1)
      if (last?.role === 'user' && last.parts.every((p) => p.functionResponse)) last.parts.push(part)
      else contents.push({ role: 'user', parts: [part] })
    }
  }
  return contents
}

function body(cfg, { system, messages, tools, model }) {
  const generationConfig = { temperature: cfg.temperature ?? 0.2, maxOutputTokens: cfg.maxOutputTokens ?? 2048 }
  if (cfg.thinkingBudget !== undefined && /2\.5/.test(model)) generationConfig.thinkingConfig = { thinkingBudget: cfg.thinkingBudget }
  const out = { contents: toContents(messages), generationConfig }
  if (system) out.systemInstruction = { parts: [{ text: system }] }
  if (tools?.length) out.tools = [{ functionDeclarations: tools.map((t) => ({ name: t.name, description: t.description, parameters: t.parameters })) }]
  return out
}

function parseCandidate(data) {
  const cand = data.candidates?.[0]
  if (!cand) {
    const reason = data.promptFeedback?.blockReason
    throw new Error(reason ? `Gemini blocked the prompt (${reason})` : 'Gemini returned no candidates')
  }
  const parts = cand.content?.parts ?? []
  return {
    text: parts.filter((p) => p.text && !p.thought).map((p) => p.text).join(''),
    toolCalls: parts.filter((p) => p.functionCall).map((p, i) => ({ id: `call_${i}`, name: p.functionCall.name, args: p.functionCall.args ?? {} })),
    finishReason: cand.finishReason,
    usage: data.usageMetadata ? { input: data.usageMetadata.promptTokenCount, output: data.usageMetadata.candidatesTokenCount } : null,
  }
}

export const gemini = {
  async chat(cfg, token, req) {
    const model = req.model ?? cfg.model
    const { data } = await request(`${cfg.baseUrl}/models/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST',
      headers: authHeaders(cfg, token),
      body: body(cfg, { ...req, model }),
      timeoutMs: 90_000,
      retries: 2,
    })
    return { ...parseCandidate(data), model }
  },

  // Yields { type: 'text', text } deltas, then { type: 'done', ... }.
  async *stream(cfg, token, req) {
    const model = req.model ?? cfg.model
    const res = await fetch(`${cfg.baseUrl}/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...authHeaders(cfg, token) },
      body: JSON.stringify(body(cfg, { ...req, model })),
      signal: req.signal ?? AbortSignal.timeout(120_000),
    })
    if (!res.ok) throw new Error(`Gemini ${res.status}: ${(await res.text()).slice(0, 300)}`)
    let usage = null
    let finishReason = null
    const toolCalls = []
    for await (const data of readSse(res.body)) {
      const parsed = parseCandidate(data)
      if (parsed.text) yield { type: 'text', text: parsed.text }
      toolCalls.push(...parsed.toolCalls)
      usage = parsed.usage ?? usage
      finishReason = parsed.finishReason ?? finishReason
    }
    yield { type: 'done', toolCalls: toolCalls.map((c, i) => ({ ...c, id: `call_${i}` })), usage, finishReason, model }
  },

  async listModels(cfg, token) {
    const { data } = await request(`${cfg.baseUrl}/models`, { headers: authHeaders(cfg, token), retries: 1, timeoutMs: 15_000 })
    return (data.models ?? []).filter((m) => m.supportedGenerationMethods?.includes('generateContent')).map((m) => m.name.replace(/^models\//, ''))
  },
}
