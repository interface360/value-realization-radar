---
title: Salesforce mapping guide
section: Administration
order: 21
summary: Which Salesforce objects and fields feed each VRR entity — Account, Contract, Opportunity, Contact roles, Asset, Project__c — with SOQL examples.
---

# Salesforce mapping guide

**Account** is the main object, and each radar bubble is one Salesforce Account. The other fields come
from objects related to the Account.

## Field sources

| VRR field | Salesforce object | Typical field |
|---|---|---|
| `accounts.id`, `name` | **Account** | `Id`, `Name` |
| `accounts.arr_value` | **Account** (custom) | `ARR__c`, often a roll-up of active contracts or subscriptions. With Salesforce CPQ, add up `SBQQ__Subscription__c`. |
| `accounts.renewal_date` | **Contract** or renewal **Opportunity** | `Contract.EndDate`, or `CloseDate` of an Opportunity with `Type = 'Renewal'` |
| `accounts.sponsor_name` | **Contact** via a role | `AccountContactRelation.Roles` / `OpportunityContactRole`, or a custom lookup |
| `telemetry.purchased_capacity` | **Asset**, **Contract**, **OpportunityLineItem** | Quantity or licensed units |
| `telemetry.consumed_capacity`, `usage.*` | Usually **not in Salesforce** | Product analytics, billing or warehouse |
| `projects.*` | Custom **Project__c**, or Certinia **pse__Proj__c** | Status and blocker picklists |

> ⚠️ **Do not use `Account.AnnualRevenue` for ARR.** It is the customer company's own total revenue, not what
> they pay you. VRR's auto-map never suggests it for ARR.

**Opportunity** gives you renewal date and amount, but not one row per customer. **Case** is usually
support tickets; map it to Projects only if your team tracks onboarding work as Cases.

## Recommended setup

### 1. Accounts: one custom SOQL stream

In **Connection settings → Show advanced settings → Custom SOQL streams**:

```json
[{
  "id": "AccountsForVRR",
  "cursorField": "SystemModstamp",
  "soql": "SELECT Id, Name, ARR__c, SystemModstamp, (SELECT EndDate FROM Contracts WHERE Status = 'Activated' ORDER BY EndDate DESC LIMIT 1), (SELECT Contact.Name FROM AccountContactRelations WHERE Roles INCLUDES ('Executive Sponsor') LIMIT 1) FROM Account WHERE Type = 'Customer' AND SystemModstamp >= {{since}}"
}]
```

Then map:

| VRR field | Path | Transforms |
|---|---|---|
| id | `Id` | |
| name | `Name` | |
| arr_value | `ARR__c` | `number` |
| renewal_date | `Contracts.records[0].EndDate` | `date` |
| sponsor_name | `AccountContactRelations.records[0].Contact.Name` | fallback `Unassigned` |

### 2. Projects

- **Stream:** `Project__c`.
- **Match account by:** External ID from this source.
- **Fields:** `Id`, `Account__c`, `Name`.
- **`status` value map:** for example `In Progress → On Track`, `At Risk → Delayed`, `On Hold → Stalled`.
- **`blocker_type`:** taken from your blocker picklist, with the fallback `None`.

### 3. Capacity and usage

Pull from a second connection (CSV or REST from your warehouse) keyed by the **Salesforce Account Id**,
and set **Match account by → External ID from any source**.

If purchased capacity lives on Assets, add an `Assets` subquery to the custom SOQL and map
`purchased_capacity` to `Assets.records[*].Quantity` with the `sum` transform.

## Authentication

| Method | Use when |
|---|---|
| **OAuth client credentials** (default) | A Connected App with the client-credentials flow and a "Run As" integration user |
| **OAuth refresh token** | You already have a refresh token from a web-server flow. Use `test.salesforce.com` for sandboxes. |
| **Access token** | Quick tests only. The token expires. |

The integration user needs read access to every object and field you map.

## Gotchas

- **Contract changes can be missed.** Incremental pulls watch the Account's `SystemModstamp`. If only a
  Contract changes, the Account doesn't. Set the accounts stream to **Full refresh**, or run a daily full refresh.
- **`AccountContactRelation`** exists only when *Contacts to Multiple Accounts* is enabled.
- **Field names differ in every org.** Treat `ARR__c`, `Project__c` and role names as examples.
- **Compound fields** (addresses, geolocation) are skipped automatically when VRR builds `SELECT` lists.
