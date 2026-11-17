---
title: Troubleshooting & FAQ
section: Help
order: 40
summary: Fixes for common problems — server unreachable, empty radar, rejected rows, CRM auth errors, assistant setup — plus FAQ.
---

# Troubleshooting & FAQ

## Common problems

| Symptom | Cause | Fix |
|---|---|---|
| Header shows **SERVER UNREACHABLE** | The sync server isn't running, or it's on a different URL | Run `npm run server`, and check the workspace URL in the header menu |
| `localhost:8787` shows "No route for GET /" | Expected. It is an API with no web page. | Open the dashboard at `localhost:5173`. Check the server at `/api/health`. |
| Radar is empty in a tenant workspace | Nothing has been synced yet | **Data Sources → Pull now**. The banner on the analytics tabs links there. |
| "API key was rejected" | The key is wrong or was rotated | Use `.vrr-data/demo-tenant.key`, or rotate the key with the admin API |
| My saved workspace disappeared | Workspaces are stored per browser **and per origin** (port) | Reconnect on the new port |
| CORS error in the console | The dashboard origin isn't allowed | Add it to `VRR_CORS_ORIGINS` |
| Sync status **partial** | Some rows failed validation | **Sync history** → expand the run to see each rejection reason |
| Projects "unmatched account" | The account reference doesn't match any synced account | Sync Accounts first, or change **Match account by** |
| "Unmapped status values" | The source uses labels missing from the value map | Add them in the mapping editor's value map |
| Salesforce `INVALID_FIELD` | A field isn't visible to the integration user | Grant field-level security, or remove the field from the custom SOQL |
| ServiceNow 403 on a table | ACLs | Give the integration user read access to that table |
| HubSpot 403 | Missing scope | Add `crm.objects.<type>.read` to the private app |
| "Blocked request to private network host" | SSRF protection in production | Set `VRR_ALLOW_PRIVATE_NETWORK=true` if the host really is internal |
| Renewal dates don't update from Contracts | Incremental pulls only watch the parent object | Use **Full refresh** for that entity, or schedule a daily full refresh |
| Assistant: "No LLM provider is configured" | No token env var is set | Add `VRR_GEMINI_TOKEN` or `VRR_OPENAI_TOKEN` to `.env.local` and restart the server |
| Assistant: 401 from the provider | The token is invalid or expired | Get a new token |
| Assistant gives wrong numbers | It answered without calling a data tool | Ask it to "check the data". Turn on the `useDataTools` option. Try a stronger model. |

## Resetting

| What | How |
|---|---|
| Module overrides | **Modules → Reset all overrides** |
| Local demo data | **Modules → Reset demo data** (in Local demo) |
| A tenant's interventions and activity | **Modules → Reset app data** (in a tenant workspace) |
| One connection's synced data | Delete the connection |
| Everything on the server | Stop the server and delete `.vrr-data/`. **This also deletes the encryption key, so stored credentials can no longer be read.** |

## FAQ

**Is this a tool for buyers or sellers?**
Sellers. It is built for customer success managers, account executives and their leaders, to protect renewals and
grow accounts by driving adoption.

**Does VRR write back to my CRM?**
No. Sync only pulls. Interventions and blockers live in VRR. Writing them back to the CRM (as tasks, for example)
would be a natural next module.

**Where does consumption data come from?**
Usually not from the CRM. Connect your product analytics, billing or warehouse as a CSV or REST source, and
match accounts by "External ID from any source".

**Can I change the 40% and 90-day thresholds?**
Yes. Change them globally in `shared/config/thresholds.js` (one file, used everywhere), or per view in the
Commercial Flexibility options.

**Is "ARR at risk" a churn forecast?**
No. It is a rule: the ARR of accounts that have any Delayed or Stalled project. See
[Metrics reference](metrics.md#what-vrr-does-not-calculate-yet).

**Can several CRMs feed one workspace?**
Yes. Add a connection for each one. IDs are namespaced per connection, and child entities can match accounts from
any source.

**Which LLM should I use for the assistant?**
`gemini-2.5-flash` or `gpt-4o-mini` for speed. `gemini-2.5-pro` or `gpt-4.1` for harder analytical questions.
See [AI assistant](ASSISTANT.md).
