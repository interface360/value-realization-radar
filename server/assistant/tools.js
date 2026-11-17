import { THRESHOLDS } from '../../shared/config/thresholds.js'
import { deriveAccounts, portfolioSummary } from '../../shared/metrics/derive.js'

// Read-only tools the assistant can call. Every tool works on one tenant's
// portfolio snapshot (or the browser's demo snapshot) — never across tenants.

const round = (n, d = 0) => (n == null ? null : Number(n.toFixed(d)))
const pct = (r) => round(r * 100, 1)

function compact(a) {
  return {
    id: a.id,
    name: a.name,
    arr: a.arr_value,
    renewal_date: a.renewal_date,
    days_to_renewal: a.daysToRenewal,
    realization_pct: pct(a.realization),
    status: a.status,
    underused_arr: Math.round(a.underusedArr),
    renewal_danger: a.isRenewalDanger,
    blockers: a.blockers,
    active_interventions: a.activeInterventions.map((i) => i.type),
    sponsor: a.sponsor_name ?? null,
  }
}

const SORTS = {
  arr: (a, b) => b.arr_value - a.arr_value,
  renewal: (a, b) => a.daysToRenewal - b.daysToRenewal,
  realization: (a, b) => a.realization - b.realization,
  underused_arr: (a, b) => b.underusedArr - a.underusedArr,
}

export const TOOL_DEFS = [
  {
    name: 'search_docs',
    description: 'Search the VRR product documentation. Use for questions about features, how metrics are defined, configuration, CRM mapping, the API or troubleshooting.',
    parameters: { type: 'object', properties: { query: { type: 'string', description: 'What to look up' } }, required: ['query'] },
  },
  {
    name: 'get_portfolio_summary',
    description: 'Headline KPIs for the current workspace: total ARR, ARR at risk, value realization, renewal-danger count, active interventions, account counts by status.',
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'list_accounts',
    description: 'List accounts in the current workspace with optional filters. Returns ARR, renewal, realization %, status, underused ARR, blockers and active interventions.',
    parameters: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: ['On Track', 'Delayed', 'Stalled', 'at_risk'], description: 'at_risk = Delayed or Stalled' },
        renewal_danger: { type: 'boolean', description: `Only accounts renewing in < ${THRESHOLDS.renewalWindowDays} days with < ${THRESHOLDS.lowRealization * 100}% realization` },
        max_days_to_renewal: { type: 'number' },
        max_realization_pct: { type: 'number' },
        blocker: { type: 'string', enum: ['API', 'Template', 'Missing Feature'] },
        has_active_intervention: { type: 'boolean' },
        name_contains: { type: 'string' },
        sort_by: { type: 'string', enum: ['arr', 'renewal', 'realization', 'underused_arr'] },
        limit: { type: 'number', description: 'Default 15, max 50' },
      },
    },
  },
  {
    name: 'get_account',
    description: 'Full detail for one account by name or id: projects with status and blocker, interventions, capacity, 12-week usage trend, sponsor.',
    parameters: { type: 'object', properties: { name_or_id: { type: 'string' } }, required: ['name_or_id'] },
  },
  {
    name: 'blocker_breakdown',
    description: 'ARR and number of accounts tied to each blocker type (API, Template, Missing Feature) — the Delivery Friction view.',
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'list_connections',
    description: 'Data-source connections for this workspace with sync health, last sync and mapped entities.',
    parameters: { type: 'object', properties: {} },
  },
]

export function createTools({ snapshot, docsIndex, connections }) {
  let derived = null
  const accounts = () => (derived ??= deriveAccounts(snapshot ?? {}))
  const findAccount = (q) => {
    const s = String(q ?? '').toLowerCase().trim()
    const list = accounts()
    return list.find((a) => a.id.toLowerCase() === s) ?? list.find((a) => a.name.toLowerCase() === s) ?? list.find((a) => a.name.toLowerCase().includes(s))
  }

  const impl = {
    search_docs({ query }) {
      const hits = docsIndex.search(query, { limit: 4 })
      return { results: hits.map((h) => ({ page: h.slug, page_title: h.title, heading: h.heading, anchor: h.anchor, text: h.text.slice(0, 1800) })) }
    },
    get_portfolio_summary() {
      const list = accounts()
      const s = portfolioSummary(list)
      const byStatus = { 'On Track': 0, Delayed: 0, Stalled: 0 }
      for (const a of list) byStatus[a.status]++
      return {
        accounts: s.count,
        total_arr: s.totalArr,
        arr_at_risk: s.atRiskArr,
        arr_at_risk_pct: s.totalArr ? pct(s.atRiskArr / s.totalArr) : 0,
        value_realization_pct: pct(s.realization),
        renewal_danger_accounts: s.dangerCount,
        active_interventions: s.activeInterventions,
        accounts_by_status: byStatus,
        underused_arr_total: Math.round(list.reduce((t, a) => t + a.underusedArr, 0)),
        thresholds: { renewal_window_days: THRESHOLDS.renewalWindowDays, low_realization_pct: THRESHOLDS.lowRealization * 100 },
      }
    },
    list_accounts(args = {}) {
      let list = accounts()
      if (args.status === 'at_risk') list = list.filter((a) => a.isAtRisk)
      else if (args.status) list = list.filter((a) => a.status === args.status)
      if (args.renewal_danger != null) list = list.filter((a) => a.isRenewalDanger === Boolean(args.renewal_danger))
      if (args.max_days_to_renewal != null) list = list.filter((a) => a.daysToRenewal >= 0 && a.daysToRenewal <= Number(args.max_days_to_renewal))
      if (args.max_realization_pct != null) list = list.filter((a) => a.realization * 100 <= Number(args.max_realization_pct))
      if (args.blocker) list = list.filter((a) => a.blockers.includes(args.blocker))
      if (args.has_active_intervention != null) list = list.filter((a) => a.hasActiveIntervention === Boolean(args.has_active_intervention))
      if (args.name_contains) list = list.filter((a) => a.name.toLowerCase().includes(String(args.name_contains).toLowerCase()))
      const total = list.length
      list = [...list].sort(SORTS[args.sort_by] ?? SORTS.arr)
      const limit = Math.min(Math.max(1, Number(args.limit) || 15), 50)
      return { total_matching: total, total_arr_matching: list.reduce((t, a) => t + a.arr_value, 0), returned: Math.min(limit, total), accounts: list.slice(0, limit).map(compact) }
    },
    get_account({ name_or_id }) {
      const a = findAccount(name_or_id)
      if (!a) return { error: `No account matches "${name_or_id}"`, hint: 'Use list_accounts with name_contains to find it.' }
      return {
        ...compact(a),
        purchased_capacity: a.telemetry.purchased_capacity,
        consumed_capacity: a.telemetry.consumed_capacity,
        last_active_date: a.telemetry.last_active_date,
        weekly_usage_last_12: a.history,
        velocity_units_per_week: round(a.velocity, 1),
        drop_off_from_peak_pct: pct(a.dropOff),
        projects: a.projects.map((p) => ({ name: p.name, status: p.status, blocker: p.blocker_type })),
        interventions: a.interventions.map((i) => ({ type: i.type, status: i.status, started: i.created_at, details: i.details })),
      }
    },
    blocker_breakdown() {
      const out = {}
      for (const a of accounts()) {
        for (const b of a.blockers) {
          out[b] ??= { blocker: b, arr: 0, accounts: 0, stalled_accounts: 0, top_accounts: [] }
          out[b].arr += a.arr_value
          out[b].accounts++
          if (a.projects.some((p) => p.blocker_type === b && p.status === 'Stalled')) out[b].stalled_accounts++
          out[b].top_accounts.push({ id: a.id, name: a.name, arr: a.arr_value })
        }
      }
      return {
        attribution: 'full ARR per blocker (an account with two blockers counts under both)',
        blockers: Object.values(out)
          .sort((x, y) => y.arr - x.arr)
          .map((b) => ({ ...b, top_accounts: b.top_accounts.sort((x, y) => y.arr - x.arr).slice(0, 5) })),
      }
    },
    list_connections() {
      if (!connections) return { note: 'This is the local demo workspace — there are no data-source connections. Connect a tenant workspace to sync a CRM.' }
      return {
        connections: connections.list().map((c) => ({
          name: c.name,
          connector: c.connector,
          status: c.status,
          last_success_at: c.last_success_at,
          last_error: c.last_error,
          schedule_minutes: c.schedule_minutes,
          mapped_entities: Object.entries(c.mapping ?? {})
            .filter(([, m]) => m?.enabled)
            .map(([e]) => e),
        })),
      }
    },
  }

  return {
    defs: TOOL_DEFS,
    async run(name, args) {
      const fn = impl[name]
      if (!fn) return { error: `Unknown tool ${name}` }
      try {
        return await fn(args ?? {})
      } catch (e) {
        return { error: e.message }
      }
    },
    summarize(name, args, result) {
      if (name === 'search_docs') return `searched docs for “${args.query}” · ${result.results?.length ?? 0} sections`
      if (name === 'list_accounts') return `listed accounts · ${result.total_matching ?? 0} match`
      if (name === 'get_account') return result.error ? result.error : `read ${result.name}`
      if (name === 'get_portfolio_summary') return `read portfolio KPIs · ${result.accounts} accounts`
      if (name === 'blocker_breakdown') return `read blocker breakdown · ${result.blockers?.length ?? 0} blockers`
      if (name === 'list_connections') return `read connections · ${result.connections?.length ?? 0}`
      return name
    },
  }
}
