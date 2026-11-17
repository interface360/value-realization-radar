---
title: Security & multi-tenancy
section: Administration
order: 24
summary: Tenant isolation, API keys, credential encryption, SSRF protection, LLM data handling and production hardening.
---

# Security & multi-tenancy

## Tenant model

A **tenant** is an isolated workspace. Everything it owns carries a `tenant_id`:

- connections and their encrypted credentials
- sync runs and cursors
- synced accounts, telemetry, usage and projects
- interventions, activity and project overrides
- uploaded CSV files (`.vrr-data/uploads/<tenant>/<connection>/`)

## Authentication

| Caller | Credential | Scope |
|---|---|---|
| Dashboard and API clients | **Tenant API key** `vrr_<tenantId>.<secret>`, sent as `Authorization: Bearer …` | One tenant |
| Platform admin | **Admin token**, sent as `X-Admin-Token: …` | Create, list, rotate and delete tenants |

- Only the **SHA-256 hash** of each key's secret is stored, and keys are compared in constant time.
- The full key is shown **once**, when the tenant is created or its key is rotated. Rotating a key revokes the old one immediately.
- The dashboard keeps saved workspace keys in browser `localStorage`. In shared environments, put SSO in front of the server (see below).

## Isolation guarantees

- Every tenant route derives the tenant **only from the API key**. No route accepts a tenant ID from the request.
- All SQL is in `server/repo/*`. Each repository is created for one `tenantId`, and every query includes it.
- Synced IDs are namespaced as `<connectionId>:<externalId>`, so sources can't collide.
- Tests (`server/sync/sync.test.mjs`) check that tenant B cannot read, sync or write tenant A's data.
- **AI assistant:** its tools are bound to the requesting tenant's repositories, so the assistant can only see the caller's data.

## Credentials

- CRM secrets (passwords, client secrets, tokens) are encrypted with **AES-256-GCM** before storage.
- The key comes from `VRR_SECRET_KEY`, or from a generated `.vrr-data/secret.key` with file mode 0600.
- Secrets are **write-only** through the API. Responses list only *which* secret fields are set.
- On update, leaving a secret field blank keeps the stored value, and sending `""` clears it.
- **LLM tokens** are read only from server environment variables. They are never stored in the database, sent to the browser, or written to logs.

## Outbound requests (SSRF)

Tenants configure arbitrary URLs for the REST and CSV connectors, so outbound calls are restricted:

- Only `http` and `https`.
- Requests to private, loopback and link-local addresses (10/8, 172.16/12, 192.168/16, 127/8, 169.254/16, ::1, fc00::/7, and others) are **blocked** when `NODE_ENV=production`, unless `VRR_ALLOW_PRIVATE_NETWORK=true`.
- Redirects are followed manually, and each hop is checked again.
- Timeouts, limited retries, and an upload size cap of 12 MB.

## Mappings are data, not code

Field mappings are JSON: paths, a fixed list of named transforms, value maps and defaults. Nothing in a
mapping is executed as code, so a tenant can't run code on the server through one.

## LLM data handling

See [AI assistant → Safety](ASSISTANT.md#safety-and-data-handling). In short, the assistant is read-only and
scoped to the tenant. The question, the relevant doc text and the tool results are sent to the configured LLM
provider. Disable `useDataTools` to keep portfolio data out of prompts.

## Production hardening checklist

- [ ] Set `NODE_ENV=production`, `VRR_SECRET_KEY` (back it up!) and `VRR_ADMIN_TOKEN` explicitly.
- [ ] Put the server behind TLS (a reverse proxy or load balancer).
- [ ] Set `VRR_CORS_ORIGINS` to your dashboard's origin only.
- [ ] Replace tenant API keys in the browser with **SSO** (OIDC or SAML) that maps users to tenants.
- [ ] Move the database to **Postgres**, with row-level security on `tenant_id` as a second layer of protection.
- [ ] Keep the encryption key in a **KMS or Vault**.
- [ ] Run the scheduler on a job queue, and set rate limits per tenant.
- [ ] Review which LLM provider handles tenant data, and its retention terms.
