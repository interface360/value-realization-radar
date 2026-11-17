---
title: Configuration
section: Administration
order: 22
summary: Every config file and environment variable — modules, thresholds, app config, LLM providers, sync server.
---

# Configuration

## Files at a glance

| File | Controls | Committed? |
|---|---|---|
| `src/config/modules.config.js` | Which features are on, their versions, order and options | Yes |
| `shared/config/thresholds.js` | Business rules: 40% realization, 90-day window, horizon, velocity window. Used by the dashboard, server and assistant. | Yes |
| `src/config/app.config.js` | App name, tagline, local DB name, demo seed, default sync-server URL | Yes |
| `config/llm.config.json` | AI assistant providers, models and defaults | Yes, and it contains **no tokens** |
| `config/llm.config.local.json` | Your local overrides for the LLM config | No (git-ignored) |
| `.env.local` | Secrets: LLM tokens, admin token, encryption key | No (git-ignored) |
| `.vrr-data/` | Sync-server database, uploads, generated keys | No (git-ignored) |

## Modules: `src/config/modules.config.js`

```js
export const MODULES_CONFIG = {
  radar: { enabled: true, order: 10, options: { horizonDays: 180 } },
  'momentum-hub': { enabled: true, version: '2' },      // latest 2.x
  'delivery-friction': { enabled: false },
  assistant: { enabled: true, locked: true },           // users can't override at runtime
}
```

| Key | Meaning |
|---|---|
| `enabled` | Turn the feature on or off |
| `version` | `'2'`, `'v2'`, `'2.x'` (latest of that major), or exact `'2.0.0-beta.1'` |
| `order` | Tab order, left to right |
| `options` | Values for the module's declared options. They are validated and clamped. |
| `locked` | Ignore the user's runtime overrides from the Module Manager |

Resolution order, where later wins: **manifest defaults → this file → Module Manager overrides**, unless `locked` is set.

### Module options

| Module | Option | Default |
|---|---|---|
| `radar` | `horizonDays` (90–540) · `maxBubble` (20–70 px) · `labelTop` (0–12) · `showDangerZone` · `showQuadrants` | 365 · 44 · 5 · on · on |
| `momentum-hub` | `includeDelayed` · v1 `sortBy` (renewal/arr/realization) · v2 `urgentDays`, `impactArr` (k$) | on · renewal · 120 · 400 |
| `delivery-friction` | `attribution` (full/split) · `showAccounts` | full · on |
| `commercial-flexibility` | `windowDays` · `maxRealization` (%) · `targetRealization` (%) · `maxExtensionMonths` | 90 · 40 · 60 · 12 |
| `intervention-drawer` | `showActivity` · `closeOnAction` | on · off |
| `kpi-strip` | `showDanger` | on |
| `data-sources` | `sampleSize` · `showAdvanced` | 25 · off |
| `assistant` | `allowProviderSwitch` · `suggestions` · `useDataTools` | on · on · on |
| `docs` | `showSearch` | on |

## Thresholds: `shared/config/thresholds.js`

```js
export const THRESHOLDS = {
  lowRealization: 0.4,     // < 40% realized = under-adopted
  renewalWindowDays: 90,   // renewals inside 90 days are "imminent"
  radarHorizonDays: 365,   // furthest renewal on the radar x-axis
  velocityWindowWeeks: 4,  // weeks used to compute consumption velocity
}
```

This one file is used by the dashboard (re-exported as `src/config/thresholds.js`), the sync server and the AI
assistant, so a change here applies everywhere.

## LLM providers: `config/llm.config.json`

See [AI assistant](ASSISTANT.md) for the full reference. In short:

```json
{
  "defaultProvider": "gemini",
  "fallbackProviders": ["openai"],
  "providers": {
    "gemini": { "type": "gemini", "baseUrl": "https://gemini-proxy.demos.mulesoft.com/v1beta", "tokenEnv": "VRR_GEMINI_TOKEN", "model": "gemini-2.5-flash" },
    "openai": { "type": "openai", "baseUrl": "https://azure-openai-proxy.demos.mulesoft.com/v1", "tokenEnv": "VRR_OPENAI_TOKEN", "model": "gpt-4o-mini" }
  }
}
```

## Environment variables

The sync server reads these from the shell or from `.env.local`. Shell values take precedence.

### Sync server

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `8787` | Server port |
| `VRR_DATA_DIR` | `./.vrr-data` | SQLite DB, uploads, generated keys |
| `VRR_ADMIN_TOKEN` | generated → `.vrr-data/admin.token` | Admin API token for managing tenants |
| `VRR_SECRET_KEY` | generated → `.vrr-data/secret.key` | Base64-encoded 32-byte AES key for credentials. **Set this and back it up in production.** |
| `VRR_CORS_ORIGINS` | localhost dev ports | Comma-separated dashboard origins |
| `VRR_ALLOW_PRIVATE_NETWORK` | `true` in dev, `false` in production | Let connectors call private IPs |
| `VRR_SCHEDULER` | on | `off` disables scheduled pulls |
| `VRR_LOG_REQUESTS` | on | `off` silences request logs |

### AI assistant

| Variable | Purpose |
|---|---|
| `VRR_GEMINI_TOKEN` | Token for the `gemini` provider |
| `VRR_OPENAI_TOKEN` | Token for the `openai` provider |
| `VRR_CUSTOM_LLM_TOKEN` | Token for the `custom` (bring-your-own) provider |
| `VRR_LLM_PROVIDER` | Override `defaultProvider` |
| `VRR_<PROVIDER>_MODEL` | Override a provider's model, e.g. `VRR_GEMINI_MODEL=gemini-2.5-pro` |
| `VRR_<PROVIDER>_BASE_URL` | Override a provider's base URL |

### Dashboard (build time)

| Variable | Default | Purpose |
|---|---|---|
| `VITE_VRR_SERVER_URL` | `http://localhost:8787` | Server URL pre-filled in the workspace connect form |
