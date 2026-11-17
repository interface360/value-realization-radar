---
title: User guide
section: Using VRR
order: 10
summary: Every view and action — Radar, Momentum Hub, Delivery Friction, Commercial Flexibility, Intervention Drawer, Data Sources, Assistant.
---

# User guide

## The header

| Element | What it does |
|---|---|
| **Status light** | Amber **LOCAL DEMO DB** means mock data in your browser. Green **SYNCED · LIVE** means a tenant workspace. Red **SERVER UNREACHABLE** means the sync server isn't running. |
| **Workspace menu** | Switch between *Local demo* and saved tenant workspaces, or connect a new one with its API key. |
| **Assistant** | Opens the AI assistant (see [below](#assistant)). |
| **Modules** | Opens the Module Manager to turn features on or off, switch versions and change options. |

## Portfolio Pulse (KPI strip)

These five tiles sit above every view:

| Tile | Meaning |
|---|---|
| **Portfolio ARR** | Total ARR across accounts |
| **ARR at risk** | ARR of accounts with any Delayed or Stalled project, and its share of the total |
| **Value realization** | Portfolio-wide consumed ÷ purchased capacity |
| **Active interventions** | Count of FDE, recovery, packaging and CS-alignment actions in progress |
| **Renewal danger** | Accounts renewing in < 90 days with < 40% realization |

## Radar

A bubble chart of every account. See [Concepts → Reading the radar](concepts.md#reading-the-radar).

- **Hover** over a bubble to see exact ARR, realization, capacity used, renewal date, underused ARR, last active date and active interventions.
- **Click** a bubble, or focus it and press Enter, to open the **Intervention Drawer**.
- **Legend chips** (On Track, Delayed, Stalled) are filters. Click one to hide or show that status.
- **Pulsing cyan ring** means the account has an active intervention.
- **Labels:** the largest accounts are labeled directly. A label is skipped when it would overlap another.

**Options** (Module Manager → Radar): renewal horizon (90–540 days), maximum bubble size, how many to label, and whether to show the danger zone and quadrant captions.

## Momentum Hub (Tab 1)

The intervention engine for CS and account teams. Red and amber accounts are pulled in automatically from the radar.

- **v1, Kanban (stable):** columns **Stalled → Delayed → Intervention Active**. Each column shows its total ARR.
- **v2, Priority matrix (beta):** a 2×2 grid. Urgency (renewal proximity) runs across, impact (underused ARR) runs up:
  - *Act now*: urgent and high impact.
  - *Plan recovery*: not urgent, high impact.
  - *Quick save*: urgent, lower impact.
  - *Monitor*: neither.

  You can adjust both thresholds.

Each card has two primary buttons:
- **Deploy FDE/Builder**: starts an *FDE Deploy* intervention.
- **Initiate Recovery Plan**: starts a *Recovery Plan* intervention.

Clicking either one saves to the database, moves the card to *Intervention Active*, and adds a pulsing ring on the radar. Click the card body to open the drawer.

Switch between v1 and v2 in **Modules → Momentum Hub → Version**.

## Delivery Friction (Tab 2)

The product feedback loop. This treemap groups stuck projects by **blocker type**, and **block area = ARR tied to that blocker**.

- The headline names the most expensive blocker, for example *"API & Documentation Gaps is stalling $11.28M in ARR."*
- Account tiles inside each block are colored by project status (red Stalled, amber Delayed). Hover a tile for its projects; click it to open the drawer.
- **Option, ARR attribution:**
  - *Full* (default): an account counts its full ARR under each blocker it has.
  - *Split*: its ARR is divided across its blockers, so the blocks add up to the total.

## Commercial Flexibility (Tab 3)

The AE safety net. It lists accounts renewing in **< 90 days** with **< 40% realization**. Both thresholds are adjustable.

Each row shows:
- **Runway bar:** today → renewal, plus the modeled extension shown striped.
- **Projection:** realization now, at renewal, and at the new end date, checked against the healthy-renewal target (default 60%).
- **Sliders:**
  - **Term extension**: 0–12 months.
  - **Assisted pace**: points of realization gained per week, with enablement support.
- **Hint:** the months of extension needed to reach the target, and the annualized ARR if the same contract value is spread over the longer term.
- **Apply flexible packaging:** saves a *Packaging* intervention that includes the modeled plan.

See [Metrics → Packaging model](metrics.md#flexible-packaging-model) for the math.

## Intervention Drawer

This glass panel slides in from the right whenever you click an account anywhere in the app.

| Section | Contents |
|---|---|
| **Top** | Status, account name, sponsor, ARR, and a 12-week usage sparkline showing the drop from peak |
| **Diagnosis** | e.g. *"Underused Capacity: $1.1M \| Project: Delayed"*, the stuck project and its blocker, plus realization, renewal and last-active figures |
| **Projects** | Each project with its status. **Unblock** clears the blocker and sets the project back to On Track. |
| **Execute strategy** | **Align CS**, **Deploy FDE**, **Log Blocker** (pick a project and a blocker type). Every click is saved. |
| **Active interventions** | What's in flight. **Mark resolved** closes one. |
| **Activity** | Audit log of everything done on the account |

Press **Esc** or click outside the panel to close it.

> In a tenant workspace, the blockers and statuses you set in VRR are saved as overrides. A later CRM pull
> does not undo them.

## Data Sources

Here you connect CRMs and other systems, map their fields, and pull data. This tab needs a tenant workspace.
The full guide is in [Data sources & mapping](INTEGRATIONS.md).

- **Connections list:** health, mapped entities, last sync and schedule.
- **Connection detail:**
  - **Pull now**: incremental sync.
  - **Full refresh**: re-pulls everything and removes deleted records.
  - **Schedule**: how often to pull automatically.
- **Field mapping:** choose the source object for each entity, then **Auto-map**, adjust, **Preview with sample** and **Save**.
- **Connection settings:** credentials (stored encrypted) and **Save & test**.
- **Sync history:** every run with its counts, log, and the reasons any rows were rejected.

## Assistant

An AI assistant that knows both this documentation and your live portfolio.

- **Ask about the product:** *"How is ARR at risk calculated?"*, *"How do I map Salesforce contracts?"*
- **Ask about your data:** *"Which danger-zone accounts have no intervention?"*, *"What's the biggest blocker by ARR?"*, *"Summarize Initech for my QBR."*
- **Answers cite sources:** doc pages appear as links, and account names open the drawer.
- **Provider and model menu:** switch between Gemini, OpenAI, or your own endpoint.

The assistant reads data. It **never changes data**: when it suggests an action, you click the button yourself.
Setup is described in [AI assistant](ASSISTANT.md).

## Docs

The **Docs** tab shows this documentation inside the app, with search.

## Module Manager

**Modules** (top right) lists every feature. For each one you can:
- **Toggle** it on or off.
- **Expand** it to see its changelog, switch **version** and adjust **options**.

Changes are saved in this browser. **Reset all overrides** returns to the defaults in `src/config/modules.config.js`. **Reset demo data** (in local mode) or **Reset app data** (in a tenant workspace) clears interventions and activity.
