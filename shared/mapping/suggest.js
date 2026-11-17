// Auto-mapping: score discovered source paths against target fields using
// synonyms + name similarity, and guess enum value maps from keywords.
import { TARGET_SCHEMA } from './targetSchema.js'

const SYNONYMS = {
  accounts: {
    id: ['id', 'accountid', 'sys_id', 'hs_object_id', 'companyid', 'account_number', 'externalid'],
    name: ['name', 'accountname', 'company', 'companyname', 'customer', 'customername'],
    arr_value: ['arr', 'arr__c', 'annualrecurringrevenue', 'hs_arr', 'acv', 'contractvalue', 'mrr'],
    renewal_date: ['renewaldate', 'renewal_date__c', 'contractenddate', 'enddate', 'ends', 'closedate', 'renewal', 'expirationdate'],
    sponsor_name: ['sponsor', 'executivesponsor', 'sponsorname', 'champion', 'primarycontact', 'contactname', 'owner.name'],
  },
  telemetry: {
    account_id: ['accountid', 'account', 'account__c', 'customerid', 'companyid', 'account_id'],
    purchased_capacity: ['purchased', 'purchasedcapacity', 'entitlement', 'licenses', 'seats', 'quantity', 'capacity', 'units'],
    consumed_capacity: ['consumed', 'consumedcapacity', 'used', 'usage', 'activeusers', 'utilized', 'consumption'],
    last_active_date: ['lastactive', 'lastactivedate', 'lastlogin', 'lastseen', 'lastactivity', 'lastactivitydate'],
  },
  usage: {
    account_id: ['accountid', 'account', 'customerid', 'companyid', 'account_id'],
    week_start: ['week', 'weekstart', 'periodstart', 'date', 'period'],
    consumed: ['consumed', 'usage', 'used', 'value', 'units', 'activeusers'],
  },
  projects: {
    id: ['id', 'projectid', 'sys_id', 'hs_object_id'],
    account_id: ['accountid', 'account', 'account__c', 'company', 'customer', 'pse__account__c', 'account_id'],
    name: ['name', 'projectname', 'title', 'subject', 'short_description'],
    status: ['status', 'status__c', 'stage', 'state', 'health', 'pse__stage__c', 'hs_pipeline_stage'],
    blocker_type: ['blocker', 'blocker__c', 'blockertype', 'blocker_type', 'risk', 'category', 'issuetype', 'reason'],
  },
}

const ENUM_KEYWORDS = {
  status: [
    ['Stalled', ['stall', 'hold', 'block', 'stuck', 'paused', 'cancel', 'red', 'critical', 'inactive', 'suspend']],
    ['Delayed', ['delay', 'risk', 'late', 'behind', 'slip', 'amber', 'yellow', 'warning', 'concern', 'overdue']],
    ['On Track', ['track', 'progress', 'active', 'green', 'healthy', 'good', 'complete', 'done', 'live', 'open', 'new', 'planned']],
  ],
  blocker_type: [
    ['API', ['api', 'integration', 'doc', 'endpoint', 'sdk', 'connector']],
    ['Template', ['template', 'config', 'setup', 'blueprint', 'starter']],
    ['Missing Feature', ['feature', 'gap', 'enhancement', 'request', 'missing', 'roadmap', 'product']],
    ['None', ['none', 'n/a', 'na', 'no blocker', 'nothing', '-']],
  ],
}

// Look-alike source fields that mean something else and must never be auto-mapped.
// Salesforce Account.AnnualRevenue is the customer company's total revenue, not ARR.
const NEVER = {
  arr_value: ['annualrevenue'],
}

const norm = (s) => String(s).toLowerCase().replace(/__c$/, '').replace(/[^a-z0-9.]/g, '')
const leaf = (path) => norm(String(path).split('.').pop().replace(/\[\d+\]/g, ''))

function similarity(a, b) {
  if (a === b) return 1
  if (a.includes(b) || b.includes(a)) return 0.75 * (Math.min(a.length, b.length) / Math.max(a.length, b.length)) + 0.2
  // bigram dice
  const grams = (s) => new Set([...Array(Math.max(0, s.length - 1))].map((_, i) => s.slice(i, i + 2)))
  const ga = grams(a)
  const gb = grams(b)
  if (!ga.size || !gb.size) return 0
  let hit = 0
  for (const g of ga) if (gb.has(g)) hit++
  return (2 * hit) / (ga.size + gb.size)
}

function typeFits(def, discovered) {
  if (!discovered) return 1
  if (def.type === 'number') return discovered.type === 'number' || discovered.samples.some((s) => !Number.isNaN(Number(String(s).replace(/[$,]/g, '')))) ? 1 : 0.4
  if (def.type === 'date') return discovered.samples.some((s) => !Number.isNaN(Date.parse(s))) ? 1 : 0.3
  return 1
}

/**
 * @param {string} entity target entity
 * @param {{path:string,type:string,samples:any[]}[]} paths discovered source paths
 * @returns {Record<string, {source:string, transforms:string[], valueMap?:object, confidence:number}>}
 */
export function suggestFieldMapping(entity, paths) {
  const schema = TARGET_SCHEMA[entity]
  const synonyms = SYNONYMS[entity] ?? {}
  const result = {}
  const taken = new Set()

  // Score every (field, path) pair, then assign greedily by score.
  const pairs = []
  for (const [field, def] of Object.entries(schema.fields)) {
    for (const p of paths) {
      if (p.type === 'array' && def.type !== 'number') continue
      const name = leaf(p.path)
      const full = norm(p.path)
      if (NEVER[field]?.includes(name)) continue
      let best = similarity(name, norm(field))
      for (const syn of synonyms[field] ?? []) best = Math.max(best, similarity(name, norm(syn)), similarity(full, norm(syn)))
      // Penalise deep paths slightly so top-level fields win ties.
      const depth = (p.path.match(/[.[]/g) ?? []).length
      const score = best * typeFits(def, p) - depth * 0.03
      if (score >= 0.55) pairs.push({ field, path: p.path, score, discovered: p })
    }
  }
  pairs.sort((a, b) => b.score - a.score)
  for (const { field, path, score, discovered } of pairs) {
    if (result[field] || taken.has(path)) continue
    const def = schema.fields[field]
    const transforms = []
    if (def.type === 'number' && discovered.type !== 'number') transforms.push('number')
    if (def.type === 'date') transforms.push('date')
    result[field] = { source: path, transforms, confidence: Math.round(score * 100) / 100 }
    if (def.type === 'enum') result[field].valueMap = suggestValueMap(field, discovered.values ?? discovered.samples)
    taken.add(path)
  }
  return result
}

export function suggestValueMap(field, rawValues) {
  const rules = ENUM_KEYWORDS[field]
  if (!rules) return {}
  const map = {}
  for (const raw of rawValues) {
    if (raw == null || raw === '') continue
    const s = String(raw).toLowerCase()
    const hit = rules.find(([, words]) => words.some((w) => s.includes(w)))
    if (hit) map[String(raw)] = hit[0]
  }
  return map
}
