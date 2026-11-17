import assert from 'node:assert/strict'
import { test } from 'node:test'
import { applyEntityMapping, discoverPaths, getPath, suggestFieldMapping, validateMapping } from './index.js'

test('getPath: nested, indexed, wildcard, quoted, case-insensitive', () => {
  const r = { Owner: { Name: 'Ada' }, Contracts: { records: [{ EndDate: '2027-01-01' }] }, lines: [{ amt: 2 }, { amt: 3 }], '@odata.nextLink': 'x', CompanyName: 'Acme' }
  assert.equal(getPath(r, 'Owner.Name'), 'Ada')
  assert.equal(getPath(r, 'Contracts.records[0].EndDate'), '2027-01-01')
  assert.deepEqual(getPath(r, 'lines[*].amt'), [2, 3])
  assert.equal(getPath(r, '["@odata.nextLink"]'), 'x')
  assert.equal(getPath(r, 'companyname'), 'Acme')
})

test('applyEntityMapping: transforms, enums, defaults, rejection', () => {
  const records = [
    { Id: '1', Name: ' Acme ', ARR: '$1,200,000', End: '12/31/2026', Lines: [{ q: 2 }, { q: 3 }] },
    { Id: '2', Name: 'Globex', ARR: '', End: '2026-06-01' },
  ]
  const { rows, rejected } = applyEntityMapping(records, 'accounts', {
    fields: {
      id: { source: 'Id' },
      name: { source: 'Name', transforms: ['trim'] },
      arr_value: { source: 'ARR', transforms: ['number'] },
      renewal_date: { source: 'End', transforms: ['date'] },
      sponsor_name: { value: 'Unassigned' },
    },
  })
  assert.equal(rows.length, 1)
  assert.deepEqual(rows[0], { id: '1', name: 'Acme', arr_value: 1200000, renewal_date: '2026-12-31', sponsor_name: 'Unassigned' })
  assert.match(rejected[0].reasons[0], /arr_value/)

  const p = applyEntityMapping([{ id: 'p', acc: 'a', n: 'X', s: 'At Risk', b: 'weird' }, { id: 'q', acc: 'a', n: 'Y', s: 'on track' }], 'projects', {
    fields: {
      id: { source: 'id' },
      account_id: { source: 'acc' },
      name: { source: 'n' },
      status: { source: 's', valueMap: { 'at risk': 'Delayed' } },
      blocker_type: { source: 'b', valueMap: { api: 'API' }, default: 'None' },
    },
  })
  assert.equal(p.rows[0].status, 'Delayed')
  assert.equal(p.rows[0].blocker_type, 'None')
  assert.equal(p.rows[1].status, 'On Track')
  assert.deepEqual(p.unmappedValues.blocker_type, { weird: 1 })
})

test('aggregate transforms over arrays', () => {
  const { rows } = applyEntityMapping([{ a: 'x', lines: [{ q: 2 }, { q: 3 }], used: '4' }], 'telemetry', {
    fields: { account_id: { source: 'a' }, purchased_capacity: { source: 'lines[*].q', transforms: ['sum'] }, consumed_capacity: { source: 'used', transforms: ['number', 'multiply:10'] } },
  })
  assert.equal(rows[0].purchased_capacity, 5)
  assert.equal(rows[0].consumed_capacity, 40)
})

test('validateMapping flags required fields and missing stream', () => {
  assert.deepEqual(validateMapping('accounts', { stream: 'A', fields: { id: { source: 'Id' }, name: { source: 'N' }, arr_value: { source: 'x' }, renewal_date: { source: 'y' } } }), [])
  const problems = validateMapping('accounts', { fields: {} })
  assert.ok(problems.some((p) => /stream/.test(p)))
  assert.ok(problems.some((p) => /ARR/.test(p)))
})

test('suggestFieldMapping maps common CRM field names', () => {
  const records = [
    { Id: '001', Name: 'Acme', ARR__c: 100, Renewal_Date__c: '2027-01-01', Executive_Sponsor__r: { Name: 'Ada' } },
    { Id: '002', Name: 'Globex', ARR__c: 200, Renewal_Date__c: '2027-02-01', Executive_Sponsor__r: { Name: 'Bo' } },
  ]
  const s = suggestFieldMapping('accounts', discoverPaths(records))
  assert.equal(s.id.source, 'Id')
  assert.equal(s.name.source, 'Name')
  assert.equal(s.arr_value.source, 'ARR__c')
  assert.equal(s.renewal_date.source, 'Renewal_Date__c')
  assert.equal(s.sponsor_name.source, 'Executive_Sponsor__r.Name')

  // Account.AnnualRevenue is company revenue, not ARR — never auto-mapped.
  assert.equal(suggestFieldMapping('accounts', discoverPaths([{ Id: '1', Name: 'A', AnnualRevenue: 5e7 }])).arr_value, undefined)

  const proj = suggestFieldMapping('projects', discoverPaths([{ Id: 'p', Account__c: 'a', Name: 'P', Status__c: 'On Hold' }, { Id: 'q', Account__c: 'a', Name: 'Q', Status__c: 'At Risk' }]))
  assert.deepEqual(proj.status.valueMap, { 'On Hold': 'Stalled', 'At Risk': 'Delayed' })
})
