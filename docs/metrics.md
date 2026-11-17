---
title: Metrics reference
section: Using VRR
order: 11
summary: Exact formulas for realization, account status, ARR at risk, renewal danger, underused ARR, velocity, drop-off and the packaging model.
---

# Metrics reference

VRR calculates every metric itself from the raw data in `shared/metrics/derive.js`. None of them are
imported from your CRM, so the definitions are the same for every source and every tenant.

Default thresholds (`shared/config/thresholds.js`, re-exported by `src/config/thresholds.js`):

| Threshold | Default | Used by |
|---|---|---|
| `lowRealization` | **0.40** (40%) | Renewal danger, Commercial Flexibility |
| `renewalWindowDays` | **90** | Renewal danger, Commercial Flexibility |
| `radarHorizonDays` | **365** | Radar x-axis, urgency |
| `velocityWindowWeeks` | **4** | Consumption velocity |

## Per-account metrics

| Metric | Formula | Notes |
|---|---|---|
| **Value realization** | `consumed_capacity ÷ purchased_capacity` | 0 when purchased is 0. Can exceed 100% (over-consumption). |
| **Days to renewal** | `round((renewal_date − today) / 1 day)` | Negative means overdue. |
| **Account status** | Worst project status: **Stalled > Delayed > On Track** | An account with no projects is On Track. |
| **At risk** | status ≠ On Track | |
| **Renewal danger** | `0 ≤ days_to_renewal < 90` **and** `realization < 40%` | |
| **Underused ARR** | `max(0, 1 − realization) × arr_value` | The revenue paid for but not used. |
| **Consumption velocity** | `(latest − value N weeks ago) ÷ N` over weekly usage, N = 4 | Capacity units per week. Negative means declining. |
| **Drop-off from peak** | `1 − latest ÷ max(history)` | Shown next to the drawer sparkline when it is over 5%. |
| **Urgency** | `clamp(1 − days_to_renewal ÷ 365, 0, 1)` | 1 means renewing today. |
| **Blockers** | Distinct `blocker_type` values ≠ None across the account's projects | |
| **Has active intervention** | Any intervention with status *Active* | Pulsing ring on the radar |

## Portfolio metrics (KPI strip)

| Metric | Formula |
|---|---|
| **Portfolio ARR** | Σ `arr_value` |
| **ARR at risk** | Σ `arr_value` of at-risk accounts, also shown as a % of portfolio ARR |
| **Value realization** | Σ consumed ÷ Σ purchased. This is capacity-weighted, *not* an average of percentages. |
| **Active interventions** | Count of interventions with status *Active* |
| **Renewal danger** | Count of renewal-danger accounts |

## Delivery Friction attribution

- **Full** (default): each blocked account adds its **whole ARR** to every blocker it has. This answers
  "how much ARR is exposed to this blocker". The total can exceed the portfolio ARR.
- **Split**: each account's ARR is divided equally across its blockers, so the blocks add up to the blocked ARR.

A tile is red if any of the account's projects with that blocker is Stalled. Otherwise it is amber.

## Momentum Hub priority matrix (v2)

- **Urgent:** `days_to_renewal ≤ urgentDays` (default 120).
- **High impact:** `underused_arr ≥ impactArr` (default $400k).

## Flexible packaging model

For an account with realization `r`, runway `D` days, a modeled extension of `m` months, and an assisted pace of
`p` percentage points per week:

```
extended_days   = D + m × 30.4
at_renewal      = r + (p/100) × D/7
at_new_end      = r + (p/100) × extended_days/7
annualised_ARR  = ARR × 12 / (12 + m)            # same contract value spread over a longer term
months_to_target(t) = ceil( max(0, ((t − r)×100/p) × 7 − D) / 30.4 )   # null if p ≤ 0
```

- **Default assisted pace:** `max(1.5, round_to_0.5(2 × observed pace))`. The observed pace is
  velocity ÷ purchased × 100, in points per week.
- **Healthy-renewal target:** 60% by default (option *targetRealization*).

This is a planning aid: it projects a straight line at a pace you choose. It does not predict churn.

## What VRR does *not* calculate (yet)

- Churn probability or a renewal forecast. The risk flags are rules, not a model tested against past renewals.
- ROI of an intervention, comparing what it cost with the ARR it kept.
- ARR reconciliation against billing.

These are good candidates for new modules. See [Module development](modules.md).
