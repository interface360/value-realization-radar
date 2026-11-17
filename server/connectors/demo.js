import { buildSeed, HISTORY_WEEKS } from '../../shared/demo/generate.js'
import { defineConnector } from './define.js'

// Sandbox source that looks like a CRM export (CRM-style field names and
// statuses) so the full connect → map → sync loop can be tried without
// credentials. Field names deliberately differ from VRR's model.

const CRM_STATUS = { 'On Track': ['In Progress', 'Green', 'Active'], Delayed: ['At Risk', 'Behind Schedule'], Stalled: ['On Hold', 'Blocked'] }
const CRM_BLOCKER = { None: '', API: 'API / Integration', Template: 'Template Gap', 'Missing Feature': 'Feature Request' }
const DAY = 86_400_000

function dataset(seed) {
  const data = buildSeed(Date.now(), Number(seed) || undefined)
  const tele = new Map(data.telemetry.map((t) => [t.account_id, t]))
  const companies = data.accounts.map((a) => ({
    Id: `001${a.id.replace(/\D/g, '').padStart(12, '0')}`,
    Name: a.name,
    ARR__c: a.arr_value,
    Renewal_Date__c: a.renewal_date,
    Executive_Sponsor__r: { Name: a.sponsor_name },
    Industry: 'Technology',
    SystemModstamp: new Date().toISOString(),
  }))
  const idOf = new Map(data.accounts.map((a, i) => [a.id, companies[i].Id]))
  const subscriptions = data.accounts.map((a) => ({
    subscription_id: `SUB-${a.id.slice(-3)}`,
    customer_ref: idOf.get(a.id),
    licensed_units: tele.get(a.id).purchased_capacity,
    units_used: tele.get(a.id).consumed_capacity,
    last_login: tele.get(a.id).last_active_date,
  }))
  const monday = (() => {
    const d = new Date()
    d.setUTCHours(0, 0, 0, 0)
    d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7))
    return d.getTime()
  })()
  const usage = data.usage.map((u) => ({
    customer_ref: idOf.get(u.account_id),
    period_start: new Date(monday - (HISTORY_WEEKS - 1 - u.week) * 7 * DAY).toISOString().slice(0, 10),
    units: u.consumed,
  }))
  const projects = data.projects.map((p, i) => {
    const options = CRM_STATUS[p.status]
    return {
      Id: `a0P${String(i + 1).padStart(12, '0')}`,
      Name: p.name,
      Account__c: idOf.get(p.account_id),
      Stage__c: options[i % options.length],
      Blocker__c: CRM_BLOCKER[p.blocker_type],
    }
  })
  return { Account: companies, Subscription: subscriptions, UsageWeekly: usage, Project__c: projects }
}

export default defineConnector({
  id: 'demo',
  name: 'Demo CRM (sandbox)',
  vendor: 'VRR',
  category: 'demo',
  description: 'Realistic sample CRM with Salesforce-style objects. Use it to try connecting, mapping and syncing with no credentials.',
  fields: [{ key: 'seed', label: 'Dataset seed', type: 'number', default: 20261104, help: 'Change to generate a different portfolio.' }],
  presets: {
    accounts: {
      stream: 'Account',
      fields: {
        id: { source: 'Id' },
        name: { source: 'Name' },
        arr_value: { source: 'ARR__c', transforms: ['number'] },
        renewal_date: { source: 'Renewal_Date__c', transforms: ['date'] },
        sponsor_name: { source: 'Executive_Sponsor__r.Name' },
      },
    },
    telemetry: {
      stream: 'Subscription',
      accountMatch: 'same_source',
      fields: {
        account_id: { source: 'customer_ref' },
        purchased_capacity: { source: 'licensed_units', transforms: ['number'] },
        consumed_capacity: { source: 'units_used', transforms: ['number'] },
        last_active_date: { source: 'last_login', transforms: ['date'] },
      },
    },
    usage: {
      stream: 'UsageWeekly',
      accountMatch: 'same_source',
      fields: { account_id: { source: 'customer_ref' }, week_start: { source: 'period_start', transforms: ['date'] }, consumed: { source: 'units', transforms: ['number'] } },
    },
    projects: {
      stream: 'Project__c',
      accountMatch: 'same_source',
      fields: {
        id: { source: 'Id' },
        account_id: { source: 'Account__c' },
        name: { source: 'Name' },
        status: {
          source: 'Stage__c',
          valueMap: { 'In Progress': 'On Track', Green: 'On Track', Active: 'On Track', 'At Risk': 'Delayed', 'Behind Schedule': 'Delayed', 'On Hold': 'Stalled', Blocked: 'Stalled' },
        },
        blocker_type: { source: 'Blocker__c', valueMap: { 'API / Integration': 'API', 'Template Gap': 'Template', 'Feature Request': 'Missing Feature' }, default: 'None' },
      },
    },
  },

  async test() {
    return { ok: true, message: 'Demo CRM ready · 4 objects' }
  },

  async listStreams() {
    return [
      { id: 'Account', label: 'Account', description: 'Companies with ARR, renewal and sponsor' },
      { id: 'Subscription', label: 'Subscription', description: 'Licensed vs used units per customer' },
      { id: 'UsageWeekly', label: 'UsageWeekly', description: '12 weeks of consumption per customer' },
      { id: 'Project__c', label: 'Project__c', description: 'Delivery projects with stage and blocker' },
    ]
  },

  async *read(ctx, streamId, { limit }) {
    const rows = dataset(ctx.config.seed)[streamId]
    if (!rows) throw new Error(`Unknown demo stream ${streamId}`)
    const out = limit ? rows.slice(0, limit) : rows
    for (let i = 0; i < out.length; i += 200) yield { records: out.slice(i, i + 200) }
  },
})
