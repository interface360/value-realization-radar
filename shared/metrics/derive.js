import { THRESHOLDS } from '../config/thresholds.js'

// Single source of truth for every derived metric. Used by the dashboard
// (via src/core/metrics/derive.js), the sync server and the AI assistant.

const DAY = 86_400_000
const STATUS_RANK = { 'On Track': 0, Delayed: 1, Stalled: 2 }

export const daysUntil = (isoDate, now = Date.now()) => Math.round((new Date(isoDate).getTime() - now) / DAY)

// Account health = its worst project's status.
function worstStatus(projects) {
  if (!projects.length) return 'On Track'
  return projects.reduce((worst, p) => ((STATUS_RANK[p.status] ?? 0) > STATUS_RANK[worst] ? p.status : worst), 'On Track')
}

// Joins the raw tables into one view model per account.
export function deriveAccounts({ accounts, telemetry, projects, interventions, usage }, now = Date.now(), thresholds = THRESHOLDS) {
  const byAccount = (rows) => {
    const map = new Map()
    for (const r of rows ?? []) {
      if (!map.has(r.account_id)) map.set(r.account_id, [])
      map.get(r.account_id).push(r)
    }
    return map
  }
  const tele = new Map((telemetry ?? []).map((t) => [t.account_id, t]))
  const proj = byAccount(projects)
  const ints = byAccount(interventions)
  const use = byAccount(usage)

  return (accounts ?? []).map((a) => {
    const t = tele.get(a.id) ?? { purchased_capacity: 0, consumed_capacity: 0, last_active_date: null }
    const accountProjects = proj.get(a.id) ?? []
    const accountInterventions = ints.get(a.id) ?? []
    const history = [...(use.get(a.id) ?? [])].sort((x, y) => x.week - y.week).map((u) => u.consumed)

    const realization = t.purchased_capacity ? t.consumed_capacity / t.purchased_capacity : 0
    const days = daysUntil(a.renewal_date, now)
    const status = worstStatus(accountProjects)
    const underusedArr = Math.max(0, 1 - realization) * a.arr_value
    const active = accountInterventions.filter((i) => i.status === 'Active')

    // Weekly consumption velocity from the trailing window (capacity units / week).
    const w = Math.min(thresholds.velocityWindowWeeks, history.length - 1)
    const velocity = w > 0 ? (history[history.length - 1] - history[history.length - 1 - w]) / w : 0
    const peak = history.length ? Math.max(...history) : 0
    const dropOff = peak ? 1 - (history[history.length - 1] ?? 0) / peak : 0
    const urgency = Math.max(0, Math.min(1, 1 - days / thresholds.radarHorizonDays))

    return {
      ...a,
      telemetry: t,
      projects: accountProjects,
      interventions: accountInterventions,
      activeInterventions: active,
      hasActiveIntervention: active.length > 0,
      history,
      realization,
      daysToRenewal: days,
      status,
      underusedArr,
      velocity,
      dropOff,
      urgency,
      blockers: [...new Set(accountProjects.map((p) => p.blocker_type).filter((b) => b && b !== 'None'))],
      isAtRisk: status !== 'On Track',
      isRenewalDanger: days >= 0 && days < thresholds.renewalWindowDays && realization < thresholds.lowRealization,
    }
  })
}

export function portfolioSummary(accounts) {
  const total = accounts.reduce((s, a) => s + a.arr_value, 0)
  const atRisk = accounts.filter((a) => a.isAtRisk)
  const consumed = accounts.reduce((s, a) => s + a.telemetry.consumed_capacity, 0)
  const purchased = accounts.reduce((s, a) => s + a.telemetry.purchased_capacity, 0)
  return {
    totalArr: total,
    atRiskArr: atRisk.reduce((s, a) => s + a.arr_value, 0),
    atRiskCount: atRisk.length,
    stalledCount: accounts.filter((a) => a.status === 'Stalled').length,
    realization: purchased ? consumed / purchased : 0,
    activeInterventions: accounts.reduce((s, a) => s + a.activeInterventions.length, 0),
    dangerCount: accounts.filter((a) => a.isRenewalDanger).length,
    count: accounts.length,
  }
}
