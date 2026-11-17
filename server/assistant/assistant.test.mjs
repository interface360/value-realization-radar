// Assistant tests: provider adapters against mock Gemini / OpenAI servers,
// docs retrieval, tool results, the agent loop and config safety.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { after, before, test } from 'node:test'
import { buildSeed } from '../../shared/demo/generate.js'
import { createLlmRegistry } from '../llm/registry.js'
import { runAgent } from './agent.js'
import { loadDocs } from './docs.js'
import { createTools } from './tools.js'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
let server
let base
const seen = []
let script = [] // queued model turns: { text } | { tool: { name, args } }

before(async () => {
  server = createServer(async (req, res) => {
    let raw = ''
    for await (const c of req) raw += c
    const body = raw ? JSON.parse(raw) : {}
    seen.push({ path: req.url, headers: req.headers, body })
    const turn = script.shift() ?? { text: 'ok' }
    const sse = req.url.includes('alt=sse') || body.stream
    if (req.url.startsWith('/gemini/')) {
      const parts = turn.tool ? [{ functionCall: turn.tool }] : [{ text: turn.text }]
      const payload = { candidates: [{ content: { role: 'model', parts }, finishReason: 'STOP' }], usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5 } }
      if (sse) {
        res.writeHead(200, { 'content-type': 'text/event-stream' })
        if (turn.text) {
          const half = Math.ceil(turn.text.length / 2)
          res.write(`data: ${JSON.stringify({ candidates: [{ content: { parts: [{ text: turn.text.slice(0, half) }] } }] })}\n\n`)
          res.write(`data: ${JSON.stringify({ ...payload, candidates: [{ content: { parts: [{ text: turn.text.slice(half) }] }, finishReason: 'STOP' }] })}\n\n`)
        } else res.write(`data: ${JSON.stringify(payload)}\n\n`)
        return res.end()
      }
      return res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(payload))
    }
    // OpenAI-compatible
    if (sse) {
      res.writeHead(200, { 'content-type': 'text/event-stream' })
      if (turn.tool) {
        res.write(`data: ${JSON.stringify({ choices: [{ index: 0, delta: { tool_calls: [{ index: 0, id: 'tc1', function: { name: turn.tool.name, arguments: '' } }] } }] })}\n\n`)
        res.write(`data: ${JSON.stringify({ choices: [{ index: 0, delta: { tool_calls: [{ index: 0, function: { arguments: JSON.stringify(turn.tool.args) } }] }, finish_reason: 'tool_calls' }] })}\n\n`)
      } else {
        for (const ch of [turn.text.slice(0, 3), turn.text.slice(3)]) res.write(`data: ${JSON.stringify({ choices: [{ index: 0, delta: { content: ch } }] })}\n\n`)
        res.write(`data: ${JSON.stringify({ choices: [{ index: 0, delta: {}, finish_reason: 'stop' }], usage: { prompt_tokens: 7, completion_tokens: 3 } })}\n\n`)
      }
      res.write('data: [DONE]\n\n')
      return res.end()
    }
    const message = turn.tool ? { role: 'assistant', content: null, tool_calls: [{ id: 'tc1', type: 'function', function: { name: turn.tool.name, arguments: JSON.stringify(turn.tool.args) } }] } : { role: 'assistant', content: turn.text }
    res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ model: body.model, choices: [{ message, finish_reason: 'stop' }], usage: { prompt_tokens: 7, completion_tokens: 3 } }))
  })
  await new Promise((r) => server.listen(0, r))
  base = `http://127.0.0.1:${server.address().port}`
  process.env.VRR_TEST_GEMINI_TOKEN = 'g-token'
  process.env.VRR_TEST_OPENAI_TOKEN = 'o-token'
})
after(() => server.close())

function registry() {
  const llm = createLlmRegistry(ROOT)
  llm.config.providers = {
    g: { type: 'gemini', baseUrl: `${base}/gemini`, tokenEnv: 'VRR_TEST_GEMINI_TOKEN', model: 'gemini-test', thinkingBudget: 0 },
    o: { type: 'openai', baseUrl: `${base}/openai`, tokenEnv: 'VRR_TEST_OPENAI_TOKEN', model: 'gpt-test' },
    missing: { type: 'openai', baseUrl: `${base}/openai`, tokenEnv: 'VRR_TEST_NOT_SET', model: 'x' },
  }
  llm.config.defaultProvider = 'missing'
  llm.config.fallbackProviders = ['g', 'o']
  return llm
}

test('committed LLM config contains no secrets and names the requested endpoints', () => {
  const raw = readFileSync(join(ROOT, 'config', 'llm.config.json'), 'utf8')
  const cfg = JSON.parse(raw)
  assert.equal(cfg.providers.gemini.baseUrl, 'https://gemini-proxy.demos.mulesoft.com/v1beta')
  assert.equal(cfg.providers.openai.baseUrl, 'https://azure-openai-proxy.demos.mulesoft.com/v1')
  for (const p of Object.values(cfg.providers)) {
    assert.ok(p.tokenEnv, 'every provider reads its token from env')
    assert.equal(p.token, undefined)
    assert.equal(p.apiKey, undefined)
  }
  assert.doesNotMatch(raw, /[A-Za-z0-9+/]{40,}={0,2}/, 'no long base64-looking tokens in config')
})

test('registry falls back past unconfigured providers and never exposes tokens', async () => {
  const llm = registry()
  const d = llm.describe()
  assert.equal(d.providers.find((p) => p.id === 'missing').configured, false)
  assert.ok(!JSON.stringify(d).includes('g-token'))
  script = [{ text: 'hello' }]
  const r = await llm.chat({ messages: [{ role: 'user', content: 'hi' }] })
  assert.equal(r.provider, 'g')
  assert.equal(r.text, 'hello')
  assert.equal(seen.at(-1).headers.authorization, 'Bearer g-token')
  assert.throws(() => llm.resolve('missing'), /No LLM provider is configured/)
})

test('Gemini adapter: system instruction, tools, function calls, function responses, streaming', async () => {
  const llm = registry()
  const tools = [{ name: 'get_kpis', description: 'k', parameters: { type: 'object', properties: {} } }]
  script = [{ tool: { name: 'get_kpis', args: {} } }]
  const r = await llm.chat({ provider: 'g', system: 'SYS', messages: [{ role: 'user', content: 'q' }], tools })
  assert.deepEqual(r.toolCalls.map((c) => c.name), ['get_kpis'])
  const req = seen.at(-1).body
  assert.equal(req.systemInstruction.parts[0].text, 'SYS')
  assert.equal(req.tools[0].functionDeclarations[0].name, 'get_kpis')

  script = [{ text: 'streamed answer' }]
  const s = llm.stream({ provider: 'g', messages: [{ role: 'user', content: 'q' }, { role: 'assistant', content: '', toolCalls: r.toolCalls }, { role: 'tool', name: 'get_kpis', toolCallId: 'call_0', content: { a: 1 } }] })
  let out = ''
  for await (const e of s.events) if (e.type === 'text') out += e.text
  assert.equal(out, 'streamed answer')
  const contents = seen.at(-1).body.contents
  assert.equal(contents[1].role, 'model')
  assert.deepEqual(contents[2].parts[0].functionResponse, { name: 'get_kpis', response: { result: { a: 1 } } })
})

test('OpenAI adapter: tool_calls (streamed in fragments), tool messages, usage', async () => {
  const llm = registry()
  const tools = [{ name: 'list_accounts', description: 'l', parameters: { type: 'object', properties: {} } }]
  script = [{ tool: { name: 'list_accounts', args: { status: 'Stalled' } } }]
  const s = llm.stream({ provider: 'o', messages: [{ role: 'user', content: 'q' }], tools })
  let done
  for await (const e of s.events) if (e.type === 'done') done = e
  assert.deepEqual(done.toolCalls, [{ id: 'tc1', name: 'list_accounts', args: { status: 'Stalled' } }])
  assert.equal(seen.at(-1).headers.authorization, 'Bearer o-token')
  assert.equal(seen.at(-1).body.tools[0].function.name, 'list_accounts')

  script = [{ text: 'final' }]
  const r = await llm.chat({ provider: 'o', messages: [{ role: 'user', content: 'q' }, { role: 'assistant', content: '', toolCalls: done.toolCalls }, { role: 'tool', toolCallId: 'tc1', name: 'list_accounts', content: { n: 2 } }] })
  assert.equal(r.text, 'final')
  const msgs = seen.at(-1).body.messages
  assert.equal(msgs[1].tool_calls[0].function.name, 'list_accounts')
  assert.deepEqual(msgs[2], { role: 'tool', tool_call_id: 'tc1', content: '{"n":2}' })
})

test('docs index loads every page and retrieves the right sections', () => {
  const { index } = loadDocs(ROOT)
  assert.ok(index.pages.length >= 14)
  const top = (q) => index.search(q, { limit: 3 }).map((r) => r.slug)
  assert.ok(top('map salesforce contract renewal date').includes('salesforce'))
  assert.ok(top('bring your own LLM provider').includes('ASSISTANT'))
  assert.ok(top('pulsing ring').includes('concepts'))
  assert.ok(top('ARR at risk calculated').includes('metrics'))
})

test('tools compute the same numbers as the dashboard and filter correctly', async () => {
  const { index } = loadDocs(ROOT)
  const tools = createTools({ snapshot: buildSeed(), docsIndex: index })
  const kpi = await tools.run('get_portfolio_summary', {})
  assert.equal(kpi.accounts, 36)
  const danger = await tools.run('list_accounts', { renewal_danger: true, limit: 50 })
  assert.equal(danger.total_matching, kpi.renewal_danger_accounts)
  assert.ok(danger.accounts.every((a) => a.renewal_danger && a.days_to_renewal < 90 && a.realization_pct < 40))
  const acct = await tools.run('get_account', { name_or_id: 'zenith' })
  assert.equal(acct.name, 'Zenith Hotels')
  assert.equal(acct.weekly_usage_last_12.length, 12)
  const blockers = await tools.run('blocker_breakdown', {})
  assert.ok(blockers.blockers[0].arr >= blockers.blockers.at(-1).arr)
  assert.match((await tools.run('list_connections', {})).note, /local demo/)
  assert.match((await tools.run('nope', {})).error, /Unknown tool/)
})

test('agent loop: retrieves docs, runs a tool, feeds the result back, streams the answer', async () => {
  const llm = registry()
  const { index } = loadDocs(ROOT)
  script = [{ tool: { name: 'get_portfolio_summary', args: {} } }, { text: 'You have 36 accounts.' }]
  const events = []
  for await (const ev of runAgent({ llm, provider: 'g', messages: [{ role: 'user', content: 'How many accounts do we have?' }], docsIndex: index, snapshot: buildSeed(), workspace: 'Test' })) events.push(ev)
  const types = events.map((e) => e.type)
  assert.deepEqual([...new Set(types)], ['sources', 'start', 'tool', 'text', 'done'])
  assert.equal(events.filter((e) => e.type === 'text').map((e) => e.text).join('').trim(), 'You have 36 accounts.')
  const second = seen.at(-1).body.contents
  const fr = second.flatMap((c) => c.parts).find((p) => p.functionResponse)
  assert.equal(fr.functionResponse.response.result.accounts, 36, 'tool result was sent back to the model')
  assert.match(seen.at(-1).body.systemInstruction.parts[0].text, /Relevant documentation/)
})

test('agent with data tools disabled only offers search_docs', async () => {
  const llm = registry()
  const { index } = loadDocs(ROOT)
  script = [{ text: 'docs only' }]
  for await (const _ of runAgent({ llm, provider: 'o', messages: [{ role: 'user', content: 'what is renewal danger' }], docsIndex: index, snapshot: buildSeed(), workspace: 'T', useDataTools: false })) void _
  assert.deepEqual(seen.at(-1).body.tools.map((t) => t.function.name), ['search_docs'])
})
