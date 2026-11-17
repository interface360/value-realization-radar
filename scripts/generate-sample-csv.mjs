#!/usr/bin/env node
// Writes sample CRM-style CSV exports to samples/csv/ for testing the CSV
// connector. Dates are relative to today, so re-run to refresh them:
//   npm run samples:csv
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'samples', 'csv')
const DAY = 86_400_000
const WEEKS = 12

const ACCOUNTS = [
  ['Globex, Inc.', 'healthy'], ['Initech', 'danger'], ['Umbrella Health', 'stalled'], ['Stark Logistics', 'healthy'],
  ['Wayne Financial', 'delayed'], ['Cyberdyne Robotics', 'danger'], ['Soylent Foods', 'healthy'], ['Tyrell Biotech', 'stalled'],
  ['Wonka Confections', 'delayed'], ['Hooli Cloud', 'healthy'], ['Pied Piper Media', 'danger'], ['Vandelay Imports', 'delayed'],
  ['Massive Dynamic', 'healthy'], ['Oscorp Energy', 'stalled'], ['Gringotts Bank', 'healthy'], ['Monsters Utilities', 'delayed'],
  ['Dunder Mifflin Paper', 'danger'], ['Acme Aerospace', 'healthy'], ['Nakatomi Trading', 'stalled'], ['Prestige Worldwide', 'delayed'],
  ['Blue Sun Retail', 'healthy'], ['Weyland Mining', 'stalled'], ['Aperture Labs', 'healthy'], ['Bluth Construction', 'danger'],
]

const PROFILES = {
  healthy: { real: [0.65, 1.05], drift: [0.05, 0.2], days: [25, 360], idle: [0, 2], health: ['Green', 'On Track', 'In Progress'] },
  delayed: { real: [0.4, 0.6], drift: [-0.06, 0.04], days: [70, 340], idle: [2, 9], health: ['At Risk', 'Behind'] },
  stalled: { real: [0.12, 0.35], drift: [-0.35, -0.12], days: [100, 350], idle: [9, 30], health: ['On Hold', 'Blocked'] },
  // Renews in < 90 days with < 40% realized → shows up in Commercial Flexibility.
  danger: { real: [0.15, 0.36], drift: [-0.3, -0.08], days: [12, 85], idle: [6, 25], health: ['On Hold', 'At Risk'] },
}

const FIRST = ['Ada', 'Grace', 'Linus', 'Margaret', 'Alan', 'Katherine', 'Dennis', 'Barbara', 'Ken', 'Radia', 'Tim', 'Frances']
const LAST = ['Lovelace', 'Hopper', 'Torvalds', 'Hamilton', 'Turing', 'Johnson', 'Ritchie', 'Liskov', 'Thompson', 'Perlman', 'Berners-Lee', 'Allen']
const PROJECTS = ['Customer Portal', 'Agent Workspace', 'Data Migration', 'Field Service App', 'Analytics Rollout', 'Partner Onboarding', 'Self-Service Bot', 'Billing Integration']
const BLOCKERS = ['API / Integration', 'Template Gap', 'Feature Request']

// Deterministic PRNG so the files are stable apart from the date shift.
let seed = 42
const rand = () => {
  seed = (seed * 1664525 + 1013904223) >>> 0
  return seed / 4294967296
}
const between = ([lo, hi]) => lo + rand() * (hi - lo)
const pick = (list) => list[Math.floor(rand() * list.length)]

const iso = (ms) => new Date(ms).toISOString().slice(0, 10)
const usDate = (ms) => {
  const d = new Date(ms)
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}/${d.getUTCFullYear()}`
}
const money = (n) => `$${n.toLocaleString('en-US')}`
const cell = (v) => {
  const s = String(v ?? '')
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}
const toCsv = (header, rows) => [header, ...rows].map((r) => r.map(cell).join(',')).join('\n') + '\n'

const today = new Date()
today.setUTCHours(0, 0, 0, 0)
const now = today.getTime()
const monday = now - ((today.getUTCDay() + 6) % 7) * DAY

const accounts = []
const subscriptions = []
const usage = []
const projects = []

ACCOUNTS.forEach(([name, profileName], i) => {
  const p = PROFILES[profileName]
  const id = `ACC-${String(1001 + i)}`
  const arr = Math.round((120_000 + Math.pow(rand(), 2) * 2_300_000) / 5_000) * 5_000
  const renewal = now + Math.round(between(p.days)) * DAY
  const purchased = Math.max(500, Math.round(arr / 100 / 50) * 50)
  const realization = between(p.real)
  const consumed = Math.round(purchased * realization)

  // Mix of formats on purpose: "$1,250,000" vs 1250000, ISO vs US dates.
  accounts.push([id, name, i % 3 === 0 ? money(arr) : arr, i % 4 === 1 ? usDate(renewal) : iso(renewal), `${pick(FIRST)} ${pick(LAST)}`, pick(['Technology', 'Healthcare', 'Financial Services', 'Retail', 'Manufacturing']), pick(['NA', 'EMEA', 'APAC'])])
  subscriptions.push([id, purchased, consumed, iso(now - Math.round(between(p.idle)) * DAY)])

  const start = Math.max(0.02, realization - between(p.drift))
  for (let w = 0; w < WEEKS; w++) {
    const t = w / (WEEKS - 1)
    const noise = w === WEEKS - 1 ? 0 : (rand() - 0.5) * 0.04
    const level = Math.max(0, start + (realization - start) * Math.pow(t, 1.4) + noise)
    usage.push([id, iso(monday - (WEEKS - 1 - w) * 7 * DAY), Math.round(purchased * level)])
  }

  const count = 1 + Math.floor(rand() * 3)
  const used = new Set()
  for (let n = 0; n < count; n++) {
    let project = pick(PROJECTS)
    while (used.has(project)) project = pick(PROJECTS)
    used.add(project)
    // First project carries the account's health; others are usually fine.
    const health = n === 0 ? pick(p.health) : rand() < 0.7 ? 'Green' : pick(p.health)
    const healthy = ['Green', 'On Track', 'In Progress'].includes(health)
    projects.push([`PRJ-${id.slice(4)}-${n + 1}`, id, project, health, healthy ? '' : pick(BLOCKERS)])
  }
})

mkdirSync(OUT, { recursive: true })
const files = {
  'accounts.csv': toCsv(['Account ID', 'Account Name', 'Annual Recurring Revenue', 'Renewal Date', 'Executive Sponsor', 'Industry', 'Region'], accounts),
  'subscriptions.csv': toCsv(['Account ID', 'Licensed Units', 'Units Consumed', 'Last Login'], subscriptions),
  'usage_weekly.csv': toCsv(['Account ID', 'Week Start', 'Units Used'], usage),
  'projects.csv': toCsv(['Project ID', 'Account ID', 'Project Name', 'Health', 'Blocker'], projects),
}
for (const [file, content] of Object.entries(files)) writeFileSync(join(OUT, file), content)
console.log(`Wrote ${Object.keys(files).length} files to samples/csv/ (${accounts.length} accounts, ${subscriptions.length} subscriptions, ${usage.length} usage rows, ${projects.length} projects)`)
