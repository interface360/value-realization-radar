import { THRESHOLDS } from '../../shared/config/thresholds.js'
import { createTools } from './tools.js'

// Tool-using agent: retrieve docs → let the model call read-only tools →
// stream the answer. Emits events: start · sources · tool · text · done · error.

const MAX_ROUNDS = 6
const MAX_HISTORY = 12

function systemPrompt({ workspace, today, docPages, useDataTools }) {
  return `You are the VRR Assistant inside Value Realization Radar — a seller-side tool that helps customer success managers, account executives and CS leaders protect and grow renewals by treating product adoption as the earliest signal of renewal risk.

Workspace: ${workspace}. Today: ${today}.

Key definitions (always consistent with the app):
- Value realization = consumed capacity ÷ purchased capacity.
- Account status = worst project status (Stalled > Delayed > On Track). "At risk" = Delayed or Stalled.
- ARR at risk = sum of ARR of at-risk accounts.
- Renewal danger = renews in < ${THRESHOLDS.renewalWindowDays} days AND realization < ${THRESHOLDS.lowRealization * 100}%.
- Underused ARR = ARR × (1 − realization).
- Interventions: FDE Deploy, Recovery Plan, Packaging, Align CS. A pulsing ring on the radar = active intervention.

Rules:
1. ${useDataTools ? 'For ANY number, account, or portfolio fact, call a data tool first. Never invent or estimate figures.' : 'Data tools are disabled for this workspace — answer from documentation only and say so if asked about live data.'}
2. For product / how-to / definition questions, use search_docs (relevant sections are also provided below).
3. You are read-only. You cannot change data. When an action helps, name the exact UI control — only these exist:
   - Intervention Drawer (click an account): "Align CS", "Deploy FDE", "Log Blocker", "Unblock", "Mark resolved".
   - Momentum Hub cards: "Deploy FDE/Builder", "Initiate Recovery Plan".
   - Commercial Flexibility rows: "Term extension" / "Assisted pace" sliders, "Apply flexible packaging".
   - Data Sources: "Pull now", "Full refresh", "Auto-map fields", "Preview with sample", "Save mapping".
   Never invent other buttons.
4. Be concise and practical: lead with the answer, then short bullets. Use Markdown tables for lists of accounts. Format money like $1.2M / $450k.
5. Link sources: documentation as [Page title](doc:<page>#<anchor>) and accounts as [Account name](account:<account id>). Only use pages and ids you actually saw.
6. If something is unknown or not in the data, say so plainly and suggest how to get it.

Available documentation pages: ${docPages}.`
}

function contextBlock(hits) {
  if (!hits.length) return ''
  return `\n\nRelevant documentation (retrieved for this question):\n${hits.map((h) => `--- [${h.title} › ${h.heading}](doc:${h.slug}${h.anchor ? `#${h.anchor}` : ''})\n${h.text.slice(0, 1500)}`).join('\n')}`
}

export async function* runAgent({ llm, provider, model, messages, docsIndex, snapshot, connections, workspace, useDataTools = true, signal }) {
  const history = messages
    .filter((m) => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
    .slice(-MAX_HISTORY)
    .map((m) => ({ role: m.role, content: m.content.slice(0, 8000) }))
  const question = [...history].reverse().find((m) => m.role === 'user')?.content ?? ''
  if (!question) throw Object.assign(new Error('Ask a question first'), { status: 400 })

  const hits = docsIndex.search(question, { limit: 4 })
  yield { type: 'sources', docs: hits.map((h) => ({ slug: h.slug, title: h.title, heading: h.heading, anchor: h.anchor })) }

  const tools = createTools({ snapshot, docsIndex, connections })
  const toolDefs = useDataTools ? tools.defs : tools.defs.filter((t) => t.name === 'search_docs')
  const system =
    systemPrompt({
      workspace,
      today: new Date().toISOString().slice(0, 10),
      docPages: docsIndex.pages.map((p) => `${p.slug} (${p.title})`).join(', '),
      useDataTools,
    }) + contextBlock(hits)

  const convo = [...history]
  let usage = { input: 0, output: 0 }
  let started = false

  for (let round = 1; round <= MAX_ROUNDS; round++) {
    const { provider: used, model: usedModel, events } = llm.stream({ provider, model, system, messages: convo, tools: toolDefs, signal })
    if (!started) {
      yield { type: 'start', provider: used, model: usedModel }
      started = true
    }
    let text = ''
    let done = null
    for await (const ev of events) {
      if (ev.type === 'text') {
        text += ev.text
        yield { type: 'text', text: ev.text }
      } else if (ev.type === 'done') done = ev
    }
    if (done?.usage) usage = { input: usage.input + (done.usage.input ?? 0), output: usage.output + (done.usage.output ?? 0) }
    const calls = done?.toolCalls ?? []
    if (!calls.length) {
      yield { type: 'done', usage, rounds: round }
      return
    }

    convo.push({ role: 'assistant', content: text, toolCalls: calls })
    for (const call of calls) {
      const allowed = toolDefs.some((t) => t.name === call.name)
      const result = allowed ? await tools.run(call.name, call.args) : { error: `Tool ${call.name} is not available` }
      yield { type: 'tool', name: call.name, args: call.args, summary: tools.summarize(call.name, call.args ?? {}, result) }
      convo.push({ role: 'tool', name: call.name, toolCallId: call.id, content: result })
    }
    if (text) yield { type: 'text', text: '\n\n' }
  }

  // Ran out of rounds: ask for a final answer without tools.
  const { events } = llm.stream({ provider, model, system, messages: [...convo, { role: 'user', content: 'Answer now with what you have.' }], signal })
  for await (const ev of events) if (ev.type === 'text') yield { type: 'text', text: ev.text }
  yield { type: 'done', usage, rounds: MAX_ROUNDS + 1 }
}
