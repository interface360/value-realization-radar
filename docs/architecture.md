---
title: Architecture
section: Development
order: 30
summary: How the dashboard, shared code, sync server, connectors, data providers and assistant fit together.
---

# Architecture

```
┌──────────────────────────── Browser: dashboard (React 19 + Vite + Tailwind 4 + D3) ────────────────────────────┐
│  App shell ─ Header (workspace switcher, Assistant, Modules) ─ KPI strip ─ Tabs ─ Overlays                    │
│     │                                                                                                         │
│     ├─ Modules (src/modules/<id>/vN)  ── import only from '@core'                                              │
│     │     radar · momentum-hub · delivery-friction · commercial-flexibility · data-sources · docs             │
│     │     intervention-drawer · assistant (overlays) · kpi-strip (header)                                     │
│     │                                                                                                         │
│     └─ @core: usePortfolio() + actions ──► DataProvider ──┬─► Local provider  (Dexie / IndexedDB demo)        │
│                                                           └─► Server provider (REST client, tenant API key)   │
└──────────────────────────────────────────────────────────────────────┬────────────────────────────────────────┘
                                                                       │ HTTPS  (Bearer vrr_…)
┌──────────────────────────── Sync server (Node 22, node:http + node:sqlite) ────────────────────────────────────┐
│  router ─ auth (tenant key / admin token) ─ tenant-scoped repos (SQLite)                                      │
│     ├─ connectors/  salesforce · servicenow · hubspot · rest · csv · demo      ──► CRM APIs (pull)             │
│     ├─ sync/        engine (read → map → validate → upsert → prune) + scheduler                               │
│     ├─ assistant/   agent (retrieve docs → tools → LLM) ── llm/ registry ──► Gemini · OpenAI · BYO            │
│     └─ lib/         encrypted secrets · SSRF-guarded fetch · CSV · SSE                                         │
└───────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
shared/   used by both sides: mapping engine & target schema · metric derivations · thresholds · demo generator · docs index
docs/     this documentation: rendered in the Docs tab and indexed by the assistant
```

## Repository layout

```
src/
├─ config/            modules.config.js · thresholds.js · app.config.js
├─ core/              the platform; modules import from '@core' only
│  ├─ api/            sync-server client
│  ├─ data/           DataProvider, usePortfolio(), backend-agnostic actions, providers/{local,server}
│  ├─ db/             local demo DB (Dexie): schema, seed, actions
│  ├─ metrics/        derive (re-exports shared/metrics) + formatters
│  ├─ modules/        registry, resolver, ModuleProvider, ModuleOutlet, error boundary
│  ├─ shell/          AppShell, Header, TabBar, ModuleManager, WorkspaceSwitcher, workspace context
│  ├─ tenancy/        saved workspaces and the active workspace
│  ├─ theme/          status/blocker/intervention tokens
│  └─ ui/             primitives (Panel, StatusPill, ActionButton, Sparkline, HoverCard, Markdown…)
└─ modules/<id>/      manifest.js · shared/ · v1/ · v2/ …
shared/               mapping/ · metrics/ · config/ · demo/ · docs/
server/               index.js · app.js · connectors/ · sync/ · repo/ · llm/ · assistant/ · lib/
config/               llm.config.json (no secrets)
docs/                 Markdown documentation
samples/csv/          sample CRM exports
scripts/              module scaffolding · sample generator · tests
```

## Key design decisions

| Decision | Why |
|---|---|
| **Modules are separate and auto-discovered** (`import.meta.glob`) | Add a folder to add a feature, delete it to remove one. Versions sit side by side, and an error boundary contains crashes. |
| **Modules import only `@core`** | No module depends on another, so any of them can be disabled or swapped. |
| **Data providers behind `usePortfolio()`** | The same UI runs on the offline demo DB or on a tenant server, without changing any module. |
| **Metrics are derived, never imported** | Every tenant and source gets the same definitions. The code is in `shared/` so the server and the assistant reuse it. |
| **Pull-based sync with cursors** | Simple and reliable. No webhooks have to be set up in each CRM. |
| **Mappings are declarative JSON** | They are safe, because nothing is executed, and they can be previewed and edited without a deploy. |
| **No external server dependencies** | `node:http` and `node:sqlite` are easy to run anywhere. The repository layer is the only part tied to SQL. |
| **The LLM runs server-side** | Tokens stay secret, tools read data scoped to the tenant, and the provider can be changed through config. |

## Data flow: a pull

1. Click **Pull now** (or the scheduler fires) → `POST /api/connections/:id/sync`.
2. `runSync` loads the connection with its decrypted secrets and runs each enabled entity in order: accounts → telemetry → usage → projects.
3. `connector.read(stream, { cursor })` yields batches of raw records, paging through the source.
4. `applyEntityMapping` converts each record into a target row, or rejects it with reasons.
5. Child rows resolve their `account_id` through the chosen match strategy.
6. A tenant-scoped upsert runs in a transaction. The cursor advances. A full refresh removes rows that weren't seen.
7. The run log and stats are saved. The dashboard re-fetches `/api/portfolio`.

## Data flow: an action

Clicking **Deploy FDE** → `startIntervention(accountId, 'FDE Deploy')` from `@core` → the active provider either
writes to IndexedDB (Dexie live query) or posts to `/api/portfolio/interventions` and refreshes → every
subscribed view re-renders → the radar shows the pulsing ring.

## Data flow: an assistant question

`POST /api/assistant/chat` → the agent picks the most relevant doc sections → the LLM is called with the
system prompt and tools → the server runs each tool call against that tenant's portfolio (or the snapshot the
browser sent, in demo mode) → the loop repeats up to 6 times → the answer streams back over SSE.
