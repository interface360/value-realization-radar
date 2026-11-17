// Deterministic mock portfolio. Renewal dates are relative to "now" so the demo
// always shows a live spread of near and far renewals.

const COMPANIES = [
  'Northwind Logistics', 'Helios Energy', 'Arcadia Health', 'Quantum Freight', 'Bluefin Retail',
  'Cobalt Financial', 'Summit Biotech', 'Meridian Insurance', 'Atlas Manufacturing', 'Vertex Media',
  'Pinecrest Foods', 'Orion Telecom', 'Lumen Analytics', 'Sierra Aerospace', 'Harbor Capital',
  'Redwood Pharma', 'Nimbus Cloudworks', 'Ironclad Security', 'Cascade Utilities', 'Polaris Mobility',
  'Granite Construction', 'Echo Education', 'Silverline Travel', 'Apex Automotive', 'Tidewater Shipping',
  'Beacon Hospitality', 'Keystone Legal', 'Starling Robotics', 'Evergreen Agritech', 'Falcon Dynamics',
  'Monarch Apparel', 'Zenith Hotels', 'Crescent Bank', 'Obsidian Games', 'Prairie Wind Power',
  'Riverside Clinics',
]

const FIRST = ['Maya', 'Jordan', 'Priya', 'Luis', 'Hana', 'Marcus', 'Elena', 'Kofi', 'Sofia', 'Daniel', 'Aiko', 'Omar', 'Grace', 'Mateo', 'Nadia', 'Theo']
const LAST = ['Chen', 'Okafor', 'Ramirez', 'Patel', 'Novak', 'Kim', 'Haddad', 'Larsen', 'Moreau', 'Singh', 'Costa', 'Weber', 'Tanaka', 'Brooks']

const PROJECTS = [
  'Claims Automation', 'Agent Console', 'Data Cloud Migration', 'Self-Service Portal', 'Field Service Rollout',
  'Partner Onboarding', 'Analytics Workspace', 'Case Deflection Bot', 'Order Orchestration',
  'Knowledge Base Revamp', 'Quote-to-Cash', 'Marketing Journeys',
]

// Ordered so the dataset always contains every quadrant of the radar.
// `danger` profiles renew in < 90 days with < 40% realization.
const PROFILE_SEQUENCE = [
  'healthy', 'stalled-danger', 'delayed', 'healthy', 'stalled', 'healthy', 'delayed-danger', 'healthy',
  'stalled', 'delayed', 'healthy', 'stalled-danger', 'healthy', 'delayed', 'healthy', 'stalled',
  'delayed-danger', 'healthy', 'delayed', 'stalled-danger', 'healthy', 'stalled', 'healthy', 'delayed',
  'healthy', 'stalled-danger', 'delayed', 'healthy', 'stalled', 'healthy', 'delayed', 'stalled-danger',
  'healthy', 'delayed', 'healthy', 'stalled',
]

const PROFILES = {
  healthy: { status: 'On Track', real: [0.62, 1.04], drift: [0.06, 0.22], days: [20, 360], idle: [0, 2] },
  delayed: { status: 'Delayed', real: [0.38, 0.62], drift: [-0.06, 0.05], days: [60, 360], idle: [2, 9] },
  stalled: { status: 'Stalled', real: [0.12, 0.36], drift: [-0.4, -0.14], days: [95, 360], idle: [8, 30] },
  'delayed-danger': { status: 'Delayed', real: [0.26, 0.38], drift: [-0.08, 0.02], days: [12, 85], idle: [3, 12] },
  'stalled-danger': { status: 'Stalled', real: [0.08, 0.32], drift: [-0.45, -0.18], days: [8, 85], idle: [10, 35] },
}

const BLOCKER_WEIGHTS = [['API', 0.45], ['Missing Feature', 0.3], ['Template', 0.25]]

export const HISTORY_WEEKS = 12
const DAY = 86_400_000

function mulberry32(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export const DEFAULT_SEED = 20261104

export function buildSeed(now = Date.now(), seed = DEFAULT_SEED) {
  const rand = mulberry32(seed)
  const between = ([lo, hi]) => lo + rand() * (hi - lo)
  const pick = (list) => list[Math.floor(rand() * list.length)]
  const weighted = (pairs) => {
    let r = rand()
    for (const [value, w] of pairs) if ((r -= w) <= 0) return value
    return pairs[pairs.length - 1][0]
  }
  const iso = (ms) => new Date(ms).toISOString().slice(0, 10)

  const out = { accounts: [], telemetry: [], projects: [], interventions: [], usage: [], activity: [] }

  COMPANIES.forEach((name, i) => {
    const id = `acc-${String(i + 1).padStart(3, '0')}`
    const profile = PROFILES[PROFILE_SEQUENCE[i % PROFILE_SEQUENCE.length]]

    // ARR: long-tailed between ~$90k and ~$2.6M
    const arr = Math.round((90_000 + Math.pow(rand(), 2.2) * 2_500_000) / 5_000) * 5_000
    const purchased = Math.max(500, Math.round(arr / 100 / 50) * 50) // capacity credits
    const realization = between(profile.real)
    const consumed = Math.round(purchased * realization)

    out.accounts.push({
      id,
      name,
      arr_value: arr,
      renewal_date: iso(now + Math.round(between(profile.days)) * DAY),
      sponsor_name: `${pick(FIRST)} ${pick(LAST)}`,
    })

    out.telemetry.push({
      account_id: id,
      purchased_capacity: purchased,
      consumed_capacity: consumed,
      last_active_date: iso(now - Math.round(between(profile.idle)) * DAY),
    })

    // Weekly history ending at today's consumption. Negative drift = drop-off.
    const drift = between(profile.drift)
    const start = Math.max(0.02, realization - drift)
    for (let w = 0; w < HISTORY_WEEKS; w++) {
      const t = w / (HISTORY_WEEKS - 1)
      const noise = w === HISTORY_WEEKS - 1 ? 0 : (rand() - 0.5) * 0.04
      const value = Math.max(0, start + (realization - start) * Math.pow(t, 1.4) + noise)
      out.usage.push({ account_id: id, week: w, consumed: Math.round(purchased * value) })
    }

    // 1–3 projects; the first carries the profile's status, the rest are equal or better.
    const projectCount = 1 + Math.floor(rand() * 3)
    const used = new Set()
    for (let p = 0; p < projectCount; p++) {
      let projectName = pick(PROJECTS)
      while (used.has(projectName)) projectName = pick(PROJECTS)
      used.add(projectName)

      const status = p === 0 ? profile.status : rand() < 0.6 ? 'On Track' : profile.status === 'Stalled' ? 'Delayed' : 'On Track'
      out.projects.push({
        id: `${id}-p${p + 1}`,
        account_id: id,
        name: projectName,
        status,
        blocker_type: status === 'On Track' ? 'None' : weighted(BLOCKER_WEIGHTS),
      })
    }
  })

  // A few interventions already in flight so the "active" state is visible on first load.
  const seeded = [
    ['acc-002', 'FDE Deploy', 'Active', 9],
    ['acc-009', 'Recovery Plan', 'Active', 4],
    ['acc-014', 'FDE Deploy', 'Active', 2],
    ['acc-004', 'Align CS', 'Resolved', 40],
  ]
  for (const [account_id, type, status, daysAgo] of seeded) {
    const at = new Date(now - daysAgo * DAY).toISOString()
    out.interventions.push({ account_id, type, status, created_at: at, details: {} })
    out.activity.push({ account_id, at, kind: 'intervention', message: `${type} ${status === 'Active' ? 'started' : 'completed'}` })
  }

  return out
}
