# Value Realization Radar

A seller-side "Dark Command Center" for customer success managers, account executives and CS leaders.
It treats **adoption as the earliest signal of renewal risk**: you see every account by time to renewal,
value realized and ARR, and you can act on what you see straight from the dashboard.

React 19 + Vite + Tailwind 4 + D3 dashboard · multi-tenant sync server that pulls from any CRM ·
AI assistant that runs on Gemini, OpenAI or your own LLM.

```bash
npm install
npm run dev       # dashboard   → http://localhost:5173   (local demo data, works offline)
npm run server    # sync server → http://localhost:8787   (tenants, CRM pulls, AI assistant)
npm test          # 31 tests: modules, mapping, connectors, sync, tenant isolation, assistant
```

To turn on the AI assistant, put a token in `.env.local` (git-ignored) and restart the server:

```bash
VRR_GEMINI_TOKEN=…    # or VRR_OPENAI_TOKEN=…
```

## Documentation

Full documentation is in **[`docs/`](docs/README.md)**. You can also read it in the app's **Docs** tab, or
ask the **Assistant** in the header.

| | |
|---|---|
| [Getting started](docs/getting-started.md) | Install and run, then load demo, CSV or CRM data |
| [Concepts](docs/concepts.md) | Value realization, renewal danger, interventions, tenants |
| [User guide](docs/user-guide.md) | Every view and action |
| [Metrics reference](docs/metrics.md) | Exact formulas |
| [Data sources & mapping](docs/INTEGRATIONS.md) · [Salesforce guide](docs/salesforce.md) | Connect and map CRMs |
| [Configuration](docs/configuration.md) | Config files and environment variables |
| [AI assistant](docs/ASSISTANT.md) | Gemini, OpenAI, or bring your own LLM |
| [Security & multi-tenancy](docs/security.md) | Isolation, credentials, hardening |
| [Architecture](docs/architecture.md) · [Modules](docs/modules.md) · [API](docs/api.md) | For developers |
| [Troubleshooting & FAQ](docs/troubleshooting.md) · [Changelog](docs/CHANGELOG.md) | Help |

## Features at a glance

| Module | What it does |
|---|---|
| **Radar** | Bubble chart. x = days to renewal, y = value realization %, size = ARR, color = project status. A pulsing ring marks an active intervention. |
| **Momentum Hub** | v1 Kanban, or v2 (beta) Urgent × Impact matrix, with *Deploy FDE/Builder* and *Initiate Recovery Plan* actions |
| **Delivery Friction** | Treemap showing the ARR stalled by each product blocker |
| **Commercial Flexibility** | Renewal runway, plus sliders to model a contract extension or flexible packaging |
| **Intervention Drawer** | Diagnosis, and the *Align CS / Deploy FDE / Log Blocker* actions |
| **Data Sources** | Connect Salesforce, ServiceNow, HubSpot, any REST CRM or CSV. Visual mapper, scheduled pulls. |
| **Docs** | This documentation, with search |
| **AI Assistant** | Answers about the docs and your live portfolio, using read-only tools |

Every feature is a module that you can enable, disable, version and configure. See [Module development](docs/modules.md).
