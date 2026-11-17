---
title: Changelog
section: Help
order: 41
summary: Release history of Value Realization Radar.
---

# Changelog

## 0.4.0: Documentation & AI assistant
- Reorganized the documentation into `docs/`, viewable in the new **Docs** tab, with search.
- Added the **VRR Assistant**, a server-side agent that answers from the docs and from live portfolio data
  using read-only tools. It supports Gemini and OpenAI, or any OpenAI-compatible LLM via `config/llm.config.json`.
- Moved metric calculations to `shared/metrics` so the server and the assistant use the same definitions.

## 0.3.0: Sample data & Salesforce guidance
- Added sample CRM-style CSV exports in `samples/csv/` and the `npm run samples:csv` generator.
- Added a Salesforce mapping guide.
- Fixed: `Account.AnnualRevenue` is no longer suggested as ARR.

## 0.2.0: Multi-tenant CRM sync
- Added a sync server (`npm run server`) with tenants, API keys and encrypted credentials.
- Added connectors: Salesforce, ServiceNow, HubSpot, any REST/JSON CRM (with Dynamics 365, Zoho, Pipedrive and
  Freshsales templates), CSV, and a demo sandbox.
- Added the **Data Sources** module: schema-driven settings, a visual field mapper with auto-map, transforms,
  value maps and live preview, scheduled and incremental pulls, and run history.
- Added a workspace switcher. The dashboard runs on either the local demo DB or a tenant server.

## 0.1.0: Initial build
- Modular dashboard: radar, Momentum Hub (Kanban v1, priority matrix v2-beta), Delivery Friction treemap,
  Commercial Flexibility runway, Intervention Drawer, and the KPI strip.
- Module system: auto-discovery, enable or disable, versioning, options, Module Manager, and an error boundary per module.
- Embedded IndexedDB (Dexie) demo data.
