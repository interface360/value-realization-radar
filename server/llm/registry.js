import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { gemini } from './providers/gemini.js'
import { openai } from './providers/openai.js'

// LLM provider registry: config/llm.config.json (+ optional
// config/llm.config.local.json) merged with env vars. Tokens only ever come
// from the environment — never from the config files or the browser.

const ADAPTERS = { gemini, openai }

function readJson(file) {
  return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {}
}

function merge(base, over) {
  const out = { ...base, ...over, providers: { ...base.providers } }
  for (const [id, p] of Object.entries(over.providers ?? {})) out.providers[id] = { ...base.providers?.[id], ...p }
  return out
}

export function loadLlmConfig(rootDir) {
  let cfg = merge(readJson(join(rootDir, 'config', 'llm.config.json')), readJson(join(rootDir, 'config', 'llm.config.local.json')))
  // Env overrides: VRR_LLM_PROVIDER, VRR_<ID>_MODEL, VRR_<ID>_BASE_URL.
  if (process.env.VRR_LLM_PROVIDER) cfg = { ...cfg, defaultProvider: process.env.VRR_LLM_PROVIDER }
  for (const [id, p] of Object.entries(cfg.providers ?? {})) {
    const key = id.toUpperCase().replace(/[^A-Z0-9]/g, '_')
    if (process.env[`VRR_${key}_MODEL`]) p.model = process.env[`VRR_${key}_MODEL`]
    if (process.env[`VRR_${key}_BASE_URL`]) p.baseUrl = process.env[`VRR_${key}_BASE_URL`]
    p.baseUrl = String(p.baseUrl ?? '').replace(/\/+$/, '')
  }
  return cfg
}

export function createLlmRegistry(rootDir) {
  const config = loadLlmConfig(rootDir)
  const tokenFor = (p) => (p.tokenEnv ? process.env[p.tokenEnv] : undefined)
  const isConfigured = (p) => Boolean(ADAPTERS[p.type] && p.baseUrl && (tokenFor(p) || p.auth === 'none'))

  function resolve(providerId) {
    const order = providerId ? [providerId] : [config.defaultProvider, ...(config.fallbackProviders ?? [])]
    for (const id of order) {
      const p = config.providers?.[id]
      if (p && isConfigured(p)) return { id, cfg: p, adapter: ADAPTERS[p.type], token: tokenFor(p) }
    }
    const tried = order.map((id) => `${id} (${config.providers?.[id]?.tokenEnv ?? 'unknown'})`).join(', ')
    throw Object.assign(new Error(`No LLM provider is configured. Set a token for: ${tried}. See docs/ASSISTANT.md.`), { status: 503 })
  }

  return {
    config,
    // Safe to expose: never includes tokens.
    describe() {
      return {
        defaultProvider: config.defaultProvider,
        providers: Object.entries(config.providers ?? {}).map(([id, p]) => ({
          id,
          label: p.label ?? id,
          type: p.type,
          baseUrl: p.baseUrl,
          model: p.model,
          models: p.models ?? [p.model],
          configured: isConfigured(p),
          tokenEnv: p.tokenEnv,
        })),
      }
    },
    resolve,
    async chat({ provider, model, ...req }) {
      const r = resolve(provider)
      return { provider: r.id, ...(await r.adapter.chat(r.cfg, r.token, { ...req, model: model ?? r.cfg.model })) }
    },
    stream({ provider, model, ...req }) {
      const r = resolve(provider)
      return { provider: r.id, model: model ?? r.cfg.model, events: r.adapter.stream(r.cfg, r.token, { ...req, model: model ?? r.cfg.model }) }
    },
    async listModels(providerId) {
      const r = resolve(providerId)
      return r.adapter.listModels(r.cfg, r.token)
    },
  }
}
