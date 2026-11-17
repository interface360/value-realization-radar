---
title: Concepts
section: Start here
order: 2
summary: The ideas behind the radar — value realization, renewal danger, interventions, tenants, connections, modules.
---

# Concepts

## The core idea

> **Adoption is the earliest indicator of renewal risk.**

A customer who bought 10,000 units of capacity and uses 2,000 is unlikely to renew at the same price,
or to renew at all. The usage numbers show this months before the renewal call does. VRR puts that
signal next to the two things that decide whether you can still fix it: **time until renewal** and
**how much revenue is at stake**.

## Vocabulary

| Term | Meaning |
|---|---|
| **Account** | A customer. Each account is one bubble on the radar. |
| **ARR** | Annual recurring revenue from the account. It sets the bubble size. |
| **Purchased capacity** | What the customer is entitled to (licenses, seats, credits, units). |
| **Consumed capacity** | What they actually use. |
| **Value realization %** | Consumed ÷ purchased. It is the radar's vertical axis. 100% means they use everything they bought. |
| **Days to renewal** | Days until the contract renews. It is the horizontal axis; imminent renewals sit on the right. |
| **Project** | A delivery or adoption initiative at the account, such as a portal rollout or a data migration. |
| **Project status** | **On Track**, **Delayed** or **Stalled**. |
| **Account status** | The *worst* status among its projects. It sets the bubble color. |
| **Blocker** | Why a project is stuck: **API** (integration or docs gaps), **Template**, or **Missing Feature**. |
| **Renewal danger** | Renews in under **90 days** *and* realization is under **40%**. You can change both thresholds. |
| **Underused ARR** | ARR × (1 − realization), the revenue the customer pays for but doesn't use. |
| **Intervention** | An action taken to rescue an account: **FDE Deploy**, **Recovery Plan**, **Packaging**, **Align CS**. While one is active, the bubble shows a pulsing ring. |
| **FDE** | Forward-deployed engineer: a builder sent in to unblock adoption hands-on. |
| **Flexible packaging** | A commercial move such as extending the term so adoption can catch up, instead of forcing a renewal decision too early. |

## Reading the radar

```
 Value realization %
  120% ┤ Healthy runway                         Ready to renew
       │      ○        ◯                ◯
  100% ┼──────────────── 100% of purchased capacity ─────────
       │   ◯         ◯       ●(amber)
   40% ┤ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─┌───────────────────┐
       │       ●(red)                   │ RENEWAL DANGER    │
    0% ┤ Adoption runway                │   ●  ◉(pulsing)   │
       └────────────────────────────────┴───────────────────┘
        365d          far ← time to renewal → imminent    now
```

- **Top-right:** using what they bought, renewing soon. Ready to renew, and possibly ready to expand.
- **Bottom-left:** low adoption but plenty of time. Fix it now while you can.
- **Bottom-right (shaded):** low adoption and renewing soon. Act now: deploy help, or change the commercial terms.
- **Size** draws your eye to the biggest dollars. **Red and amber** draw it to stuck projects.
  A **pulsing ring** means someone is already working the account.

## How work flows

```
Radar (spot) ──► Intervention Drawer (diagnose) ──► Execute strategy
                                                      ├─ Deploy FDE / Recovery Plan  → Momentum Hub (track)
                                                      ├─ Log blocker                 → Delivery Friction (product loop)
                                                      └─ Flexible packaging          → Commercial Flexibility (AE)
```

Every action is written to the database and shows on the radar right away.

## Workspaces and tenants

- **Local demo:** mock data in your browser. Good for exploring and demos.
- **Tenant workspace:** one isolated organization on the sync server, with its own connections,
  credentials, synced data, interventions and activity. You join a workspace with its **tenant API key**,
  and you can save several workspaces and switch between them in the header.

## Connections, streams and mappings

- A **connection** is one configured source, for example "Salesforce, production org".
- A **stream** is one table or object in that source, such as `Account` or `Project__c`.
- A **mapping** says how a stream's fields become VRR fields, for example
  `ARR__c → arr_value` or `"At Risk" → Delayed`.
- A **pull** (sync) reads the streams and writes the mapped rows. It is incremental by default and
  can run on a schedule.

## Modules

Every feature is a **module**: the radar, each tab, the drawer, the KPI strip and the assistant. Modules can
be **enabled, disabled, reordered, configured and versioned** independently, without code changes. See
[Module development](modules.md).
