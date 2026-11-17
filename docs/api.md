---
title: API reference
section: Development
order: 32
summary: Every sync-server REST endpoint — admin, tenant, connections, sync, portfolio and assistant — with examples.
---

# API reference

Base URL: `http://localhost:8787/api`. All bodies are JSON. Errors return `{ "error": "message" }`
with the appropriate HTTP status.

## Authentication

| Header | Used for |
|---|---|
| `Authorization: Bearer vrr_<tenantId>.<secret>` | Every tenant endpoint |
| `X-Admin-Token: <token>` | `/api/admin/*` |

```bash
KEY=$(cat .vrr-data/demo-tenant.key)
curl -H "authorization: Bearer $KEY" localhost:8787/api/me
```

## Health

| Method | Path | Auth | Returns |
|---|---|---|---|
| GET | `/health` | none | `{ ok, connectors: [...] }` |

## Admin: tenants

| Method | Path | Body | Returns |
|---|---|---|---|
| GET | `/admin/tenants` | | `[{ id, name, slug, created_at }]` |
| POST | `/admin/tenants` | `{ name }` | `{ tenant, apiKey }` (the key is shown once) |
| POST | `/admin/tenants/:tid/rotate-key` | | `{ apiKey }` |
| DELETE | `/admin/tenants/:tid` | | 204. Removes all of the tenant's data. |

## Tenant: identity and catalog

| Method | Path | Returns |
|---|---|---|
| GET | `/me` | `{ tenant, counts: { accounts, telemetry, usage, projects } }` |
| GET | `/connectors` | Connector catalog: `id, name, description, fields[], templates[], presets{}` |
| GET | `/schema` | `{ entities, order, schedules }`, the mapping target schema |

## Connections

| Method | Path | Body | Returns |
|---|---|---|---|
| GET | `/connections` | | List. Never includes secrets. |
| POST | `/connections` | `{ name, connector, values, schedule_minutes? }` | Created connection, with mappings seeded from presets |
| GET | `/connections/:id` | | Connection (`secrets_set` lists which secret keys are stored) |
| PATCH | `/connections/:id` | `{ name?, values?, mapping?, schedule_minutes?, enabled? }` | Updated connection. Secrets you leave out are kept; `""` clears one. |
| DELETE | `/connections/:id?keepData=true` | | 204. Also removes the synced data unless `keepData` is set. |
| POST | `/connections/:id/test` | | `{ ok, message }` |
| GET | `/connections/:id/streams` | | `[{ id, label, description?, incremental? }]` |
| GET | `/connections/:id/streams/:stream/sample?limit=25` | | `{ records, paths }` (paths includes samples and distinct values) |
| POST | `/connections/:id/suggest` | `{ entity, stream }` | `{ fields }`, the auto-map suggestion |
| POST | `/connections/:id/preview` | `{ entity, mapping }` | `{ rows, rejected, unmappedValues, sampleSize, unmatched }`. Nothing is written. |
| POST | `/connections/:id/upload` | `{ filename, content }` | `{ id, rows, columns }` (CSV connections only) |
| POST | `/connections/:id/sync` | `{ mode?: 'incremental'\|'full', entities?, resetCursors? }` | `{ runId, status, stats, error? }` |
| GET | `/connections/:id/runs?limit=20` | | Run history with stats and log |

`schedule_minutes` must be one of: `null`, `15`, `60`, `360`, `1440`.

### Mapping object

```json
{
  "accounts": {
    "enabled": true,
    "stream": "Account",
    "syncMode": "incremental",
    "fields": {
      "id": { "source": "Id" },
      "arr_value": { "source": "ARR__c", "transforms": ["number"] },
      "sponsor_name": { "source": "Owner.Name", "default": "Unassigned" }
    }
  },
  "projects": {
    "enabled": true,
    "stream": "Project__c",
    "accountMatch": "same_source",
    "fields": { "status": { "source": "Stage__c", "valueMap": { "At Risk": "Delayed" } } }
  }
}
```

## Portfolio

| Method | Path | Body | Returns |
|---|---|---|---|
| GET | `/portfolio` | | `{ accounts, telemetry, usage, projects, interventions }` |
| GET | `/portfolio/activity/:accountId?limit=6` | | Activity rows |
| POST | `/portfolio/interventions` | `{ account_id, type, details? }` | `{ id }`. Updates the existing one if that type is already active. |
| POST | `/portfolio/interventions/:iid/resolve` | | 204 |
| POST | `/portfolio/projects/:pid/blocker` | `{ blocker_type }` (`None` unblocks) | 204. Saved as an override that later syncs keep. |
| POST | `/portfolio/reset-app-data` | | 204. Clears interventions, activity and overrides. |

Intervention `type` is one of: `FDE Deploy`, `Recovery Plan`, `Packaging`, `Align CS`.

## Assistant

| Method | Path | Body | Returns |
|---|---|---|---|
| GET | `/assistant/providers` | | `{ defaultProvider, providers: [{ id, label, type, model, models, configured }] }`. Never includes tokens. |
| POST | `/assistant/chat` | `{ messages, provider?, model?, snapshot?, useDataTools? }` | `text/event-stream` |

`messages` is `[{ role: 'user'|'assistant', content }]`. `snapshot` is used only in demo mode (the shape of
`/portfolio`). For tenant workspaces the server reads the tenant's own data.

**SSE events** (each `data:` line is JSON with a `type`):

| type | Fields |
|---|---|
| `start` | `provider`, `model` |
| `tool` | `name`, `args`, `summary` |
| `sources` | `docs: [{ slug, title, heading }]` |
| `text` | `text`, a streamed answer chunk |
| `done` | `usage`, `rounds` |
| `error` | `message` |

```bash
curl -N -H "authorization: Bearer $KEY" -H 'content-type: application/json' \
  localhost:8787/api/assistant/chat -d '{"messages":[{"role":"user","content":"Which accounts are in the danger zone?"}]}'
```
