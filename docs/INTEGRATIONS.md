---
title: Data sources & mapping
section: Administration
order: 20
summary: Connect Salesforce, ServiceNow, HubSpot, any REST CRM or CSV; map fields; schedule pulls; multi-tenant setup.
---

# CRM integrations: connect, map, pull

VRR **pulls** data from source systems on a schedule or on demand. You configure
everything per tenant in the **Data Sources** tab. Nothing is pushed into VRR.

```
 Salesforce ─┐                         ┌───────────────── VRR sync server ─────────────────┐
 ServiceNow ─┤   connector.read()      │  mapping → validate → upsert (tenant-scoped)      │   /api/portfolio
 HubSpot ────┼──── raw records ───────▶│  accounts · telemetry · usage · projects          │──────────────▶ Dashboard
 Any REST ───┤   (paged, incremental)  │  cursors · run log · encrypted credentials        │   (per tenant)
 CSV ────────┘                         └───────────────────────────────────────────────────┘
```

## Quick start

```bash
npm run server     # terminal 1: sync server on :8787, prints a tenant API key on first start
npm run dev        # terminal 2: dashboard on :5173
```

1. Open the dashboard. Click the **Local demo** menu in the header, choose **Connect a tenant workspace**, and paste the key.
2. Go to **Data Sources → Add connection → Demo CRM (sandbox) → Create**. It needs no credentials.
3. Mappings for the demo are preset. Click **Pull now** and the radar fills up.
4. Repeat with a real source: Salesforce, ServiceNow, HubSpot, *Any CRM (REST/JSON)*, or a CSV export.

## Multi-tenancy

| Concept | How it works |
|---|---|
| **Tenant** | An isolated workspace with its own connections, credentials, synced data, interventions and activity. |
| **Tenant API key** | `vrr_<tenantId>.<secret>`. The server stores only a SHA-256 hash of the secret. Every `/api/*` call resolves the tenant from the key, and each repository query is bound to that tenant ID, so a request has no way to name another tenant's rows. |
| **Admin token** | Manages tenants at `/api/admin/*`. Read it from `VRR_ADMIN_TOKEN`, or from `.vrr-data/admin.token`, which is generated on the first start. |
| **Credentials** | Encrypted with AES-256-GCM using `VRR_SECRET_KEY`, or a generated `.vrr-data/secret.key`. They are write-only from the UI: the API reports *which* secrets are set and never returns their values. |
| **Data keys** | Synced IDs are namespaced as `<connectionId>:<externalId>`. Two sources, or two tenants, can't collide. |

```bash
ADMIN=$(cat .vrr-data/admin.token)
# create a tenant → returns { tenant, apiKey } (the key is shown once)
curl -X POST localhost:8787/api/admin/tenants -H "x-admin-token: $ADMIN" -H 'content-type: application/json' -d '{"name":"Acme Corp"}'
curl localhost:8787/api/admin/tenants -H "x-admin-token: $ADMIN"                       # list
curl -X POST localhost:8787/api/admin/tenants/<id>/rotate-key -H "x-admin-token: $ADMIN" # rotate
```

Users can save several workspaces in the header switcher and move between them.
The **Local demo** entry is the offline IndexedDB demo.

## The VRR data model (mapping target)

Every source maps into the same four entities, defined in `shared/mapping/targetSchema.js`:

| Entity | Fields (* = required) | Typical source |
|---|---|---|
| **accounts** | id\*, name\*, arr_value\*, renewal_date\*, sponsor_name | CRM account or company, plus contract and renewal fields |
| **telemetry** | account_id\*, purchased_capacity\*, consumed_capacity\*, last_active_date | Billing, entitlements, product analytics, warehouse |
| **usage** | account_id\*, week_start\*, consumed\* | Product analytics or warehouse (weekly rows) |
| **projects** | id\*, account_id\*, name\*, status\* (On Track / Delayed / Stalled), blocker_type (None / API / Template / Missing Feature) | PSA, SPM, CRM custom object, ticket pipeline |

Accounts always sync first. Child entities find their account using one of three **Match account by** options:
- **External ID from this source.** Use this when the reference is an account ID from the same connection.
- **External ID from any source.** For example, a warehouse table keyed by Salesforce Account ID, synced through a separate CSV or REST connection.
- **Account name.** A case-insensitive match on the name.

Derived metrics (realization %, ARR at risk, renewal danger) are **always computed by VRR** and never mapped.

## Mapping, field by field

Each target field takes either a **source path** or a **constant**, then an optional chain of **transforms**, a **value map** for enum fields, and a **fallback** value.

**Paths:** `Name`, `Owner.Name`, `Contracts.records[0].EndDate`, `lines[*].amount` (every element), `["@odata.nextLink"]` (a quoted key). Matching is case-insensitive.

**Transforms:** `trim`, `lower`, `upper`, `number` (handles `$1,200`, `(500)` and `1e3`), `integer`, `date` (ISO, `MM/DD/YYYY`, epoch, ServiceNow format → `YYYY-MM-DD`), `boolean`, `first`, `last`, `sum`, `count`, `join`, `multiply:N`, `divide:N`, `round:N`, `split:,`, `replace:text`.

**Value maps:** these translate a source's own vocabulary into VRR's enums, for example `At Risk → Delayed` or `On Hold → Stalled`. Unmapped values are counted and listed in the preview and in the run log.

**Auto-map:** samples real records, scores each field name against synonyms and similar names (`ARR__c`, `hs_arr`, `ACV` → `arr_value`; Salesforce `AnnualRevenue` is deliberately excluded because it is the customer company's revenue, not ARR), and suggests value maps from keywords. You can review or override every suggestion.

**Preview:** runs the mapping over live sample records without writing anything, and shows the mapped rows, rejected rows with their reasons, unmapped enum values, and any account references that don't match.

Mappings are stored as JSON on the connection, so they are data, not code. This is an example for Salesforce:

```json
{
  "accounts": {
    "enabled": true, "stream": "soql:AccountsWithSponsor", "syncMode": "incremental",
    "fields": {
      "id": { "source": "Id" },
      "name": { "source": "Name" },
      "arr_value": { "source": "ARR__c", "transforms": ["number"] },
      "renewal_date": { "source": "Contracts.records[0].EndDate", "transforms": ["date"] },
      "sponsor_name": { "source": "Executive_Sponsor__r.Name", "default": "Unassigned" }
    }
  },
  "projects": {
    "enabled": true, "stream": "Project__c", "accountMatch": "same_source",
    "fields": {
      "id": { "source": "Id" }, "account_id": { "source": "Account__c" }, "name": { "source": "Name" },
      "status": { "source": "Status__c", "valueMap": { "In Progress": "On Track", "At Risk": "Delayed", "On Hold": "Stalled" } },
      "blocker_type": { "source": "Blocker__c", "valueMap": { "API / Integration": "API" }, "default": "None" }
    }
  }
}
```

## Connectors

| Connector | Auth | Streams | Incremental cursor |
|---|---|---|---|
| **Salesforce** | OAuth client credentials, OAuth refresh token, or an access token | Every queryable custom object plus common standard objects, and custom SOQL (needed for relationship fields) | `SystemModstamp` |
| **ServiceNow** | Basic, OAuth password grant, or bearer token | CSM, SPM and contract tables plus any `u_` table you list | `sys_updated_on` |
| **HubSpot** | Private app token | Companies, deals, contacts, tickets, line items, custom objects. Associations are exposed as `associations.<type>[0]`. | `hs_lastmodifieddate` (Search API) |
| **Any CRM (REST/JSON)** | None, bearer, basic, API key in a header or query string, OAuth client credentials | The endpoints you configure | Any "updated at" field, substituted as `{{since}}` |
| **CSV / spreadsheet** | — | Uploaded files and remote CSV URLs | Full refresh |
| **Demo CRM** | — | Salesforce-style sample objects | — |

The REST connector includes **templates** for Microsoft Dynamics 365 (OData + Entra ID), Zoho CRM, Pipedrive and Freshsales. Pagination can be page number, offset/limit, a cursor token, a next-page URL, or a `Link` header.

### Adding a dedicated connector

Create `server/connectors/<name>.js` and register it in `server/connectors/index.js`:

```js
export default defineConnector({
  id: 'gainsight', name: 'Gainsight', vendor: 'Gainsight', description: '…',
  fields: [ { key: 'domain', label: 'Domain', type: 'url', required: true },
            { key: 'access_key', label: 'Access key', type: 'password', secret: true, required: true } ],
  presets: { accounts: { stream: 'Company', fields: { id: { source: 'Gsid' }, name: { source: 'Name' } } } },
  async test(ctx) { /* … */ return { ok: true, message: 'Connected' } },
  async listStreams(ctx) { return [{ id: 'Company', label: 'Company', incremental: true }] },
  async *read(ctx, streamId, { cursor, limit }) { /* page through, yield { records, cursor } */ },
})
```

The settings form, the mapper, sync, scheduling and run history all work automatically from the field schema.

## Sync behavior

- **Pull now** is an incremental sync: each entity resumes from its cursor. **Full refresh** re-pulls everything and removes rows from that connection that no longer exist in the source. You can also set **Sync mode → Full refresh** on a single entity.
- **Schedule:** manual, every 15 minutes, hourly, every 6 hours, or daily. The in-process scheduler runs due connections with bounded concurrency.
- **Rows that fail validation** are rejected rather than written. The run is marked `partial`, and the history shows the reasons for each row.
- **Interventions, activity, and blocker or status edits made in VRR** live in their own tables. Later syncs don't overwrite them.
- **Rate limits and errors:** 429 and 5xx responses are retried with backoff and `Retry-After`. A run interrupted by a restart is marked failed on the next boot.
- **SSRF guard:** outside development, connectors can't call private or loopback addresses (`VRR_ALLOW_PRIVATE_NETWORK`).

## Configuration

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `8787` | Server port |
| `VRR_DATA_DIR` | `./.vrr-data` | SQLite DB, uploads, generated keys |
| `VRR_ADMIN_TOKEN` | generated | Admin API token |
| `VRR_SECRET_KEY` | generated | Base64-encoded 32-byte credential encryption key. **Set and back this up in production.** |
| `VRR_CORS_ORIGINS` | localhost dev ports | Allowed dashboard origins |
| `VRR_ALLOW_PRIVATE_NETWORK` | `true` (dev) / `false` (prod) | Let connectors reach private IPs |
| `VRR_SCHEDULER` | on | Set to `off` to disable scheduled pulls |
| `VITE_VRR_SERVER_URL` | `http://localhost:8787` | Default server URL in the dashboard |

## Before you go to production

The server is built to be swapped out piece by piece behind stable interfaces:

- **Database:** `server/repo/*` is the only code that talks SQL. Port it to Postgres, and add row-level security on `tenant_id` as a second line of defense.
- **Scheduler:** move `server/sync/scheduler.js` to a job queue (BullMQ, Cloud Tasks, SQS) so work runs on multiple workers.
- **Auth:** tenant API keys suit a prototype. In front of real users, put SSO (OIDC or SAML) on top and map users to tenants.
- **Secrets:** replace the file-based key with a KMS or Vault data key.
- **OAuth:** add an authorization-code redirect flow so users can click "Sign in with Salesforce or HubSpot" instead of pasting tokens.
