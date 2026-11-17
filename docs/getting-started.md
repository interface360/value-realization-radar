---
title: Getting started
section: Start here
order: 1
summary: Install VRR, run it, and see data in under five minutes (demo, CSV, or a real CRM).
---

# Getting started

## Requirements

- **Node.js 22.13 or newer.** The sync server uses Node's built-in SQLite. Check with `node -v`.
- A modern browser: Chrome, Edge, Safari or Firefox.

## Install

```bash
cd value-realization-radar
npm install
```

## Option 1: Local demo (30 seconds, no server)

```bash
npm run dev
```

Open **http://localhost:5173**. The header shows **Local demo**: 36 mock accounts stored in your browser.
Everything works, including clicking bubbles, deploying FDEs and modeling packaging. Nothing leaves the
browser.

## Option 2: Your own data (5 minutes)

VRR has two processes:

| Process | Command | URL | What it is |
|---|---|---|---|
| Dashboard | `npm run dev` | http://localhost:5173 | The app you use |
| Sync server | `npm run server` | http://localhost:8787 | API that stores tenants, connects to CRMs, pulls data, and runs the AI assistant |

1. Start both, each in its own terminal:
   ```bash
   npm run server   # prints a tenant API key on first start
   npm run dev
   ```
2. Copy the API key that the server prints, or read it from `.vrr-data/demo-tenant.key`.
3. In the dashboard, click **Local demo** (top right), then **Connect a tenant workspace**, and paste the key.
4. Open **Data Sources → Add connection** and choose a source:
   - **Demo CRM (sandbox).** No credentials. Mappings are preset. Click **Pull now** and you're done.
   - **CSV / spreadsheet.** Upload the files in `samples/csv/` and see [CSV walkthrough](#csv-walkthrough).
   - **Salesforce, ServiceNow, HubSpot or any REST CRM.** See [Data sources & mapping](INTEGRATIONS.md).
5. Go back to **Radar**. Your accounts are there.

### CSV walkthrough

1. **Data Sources → Add connection → CSV / spreadsheet → Create connection**.
2. Click **Choose files** and select all four files in `samples/csv/`.
3. On **Field mapping**, do the following for each tab:
   - Tick **Sync**.
   - Pick the matching file as the source: Accounts → `accounts`, Capacity & telemetry → `subscriptions`, Usage history → `usage_weekly`, Projects → `projects`.
   - Click **Auto-map fields**.
4. Click **Save mapping**, then **Pull now**.

The sample files' dates are relative to the day they were generated. Run `npm run samples:csv` to refresh them.

## Option 3: Turn on the AI assistant

Add a token to `.env.local` in the project root. This file is git-ignored.

```bash
VRR_GEMINI_TOKEN=your-token-here
# or
VRR_OPENAI_TOKEN=your-token-here
```

Restart `npm run server`, then click **Assistant** in the dashboard header. See [AI assistant](ASSISTANT.md).

## Everyday commands

| Command | Does |
|---|---|
| `npm run dev` | Dashboard with hot reload |
| `npm run server` | Sync server (`npm run server:dev` restarts it on file changes) |
| `npm test` | All tests: module registry, mapping, connectors, sync, tenant isolation, assistant |
| `npm run build` / `npm run preview` | Production build of the dashboard, and a local preview of it |
| `npm run samples:csv` | Regenerate sample CSV files |
| `npm run module:new -- <id>` | Scaffold a new feature module |
| `npm run module:list` | List modules and versions |

## Next steps

- Learn what you're looking at: [Concepts](concepts.md)
- Learn every view: [User guide](user-guide.md)
