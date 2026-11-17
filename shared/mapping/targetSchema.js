// The VRR internal data model — the fixed target every source maps into.
// Shared by the sync server (validation) and the browser (mapping editor).

export const STATUS_VALUES = ['On Track', 'Delayed', 'Stalled']
export const BLOCKER_VALUES = ['None', 'API', 'Template', 'Missing Feature']

// Sync order matters: other entities reference accounts.
export const ENTITY_ORDER = ['accounts', 'telemetry', 'usage', 'projects']

export const TARGET_SCHEMA = {
  accounts: {
    label: 'Accounts',
    description: 'One row per customer account. Required — every other entity references it.',
    required: true,
    fields: {
      id: { label: 'External ID', type: 'string', required: true, help: 'Stable ID in the source system (e.g. Salesforce Account Id).' },
      name: { label: 'Account name', type: 'string', required: true },
      arr_value: { label: 'ARR', type: 'number', required: true, help: 'Annual recurring revenue.' },
      renewal_date: { label: 'Renewal date', type: 'date', required: true },
      sponsor_name: { label: 'Executive sponsor', type: 'string' },
    },
  },
  telemetry: {
    label: 'Capacity & telemetry',
    description: 'Purchased vs consumed capacity per account. Usually lives in billing, product analytics or a warehouse.',
    fields: {
      account_id: { label: 'Account reference', type: 'ref', required: true, help: 'The account this row belongs to.' },
      purchased_capacity: { label: 'Purchased capacity', type: 'number', required: true },
      consumed_capacity: { label: 'Consumed capacity', type: 'number', required: true },
      last_active_date: { label: 'Last active date', type: 'date' },
    },
  },
  usage: {
    label: 'Usage history',
    description: 'Weekly consumption points. Powers the usage sparkline and adoption velocity.',
    fields: {
      account_id: { label: 'Account reference', type: 'ref', required: true },
      week_start: { label: 'Week start', type: 'date', required: true },
      consumed: { label: 'Consumed in week', type: 'number', required: true },
    },
  },
  projects: {
    label: 'Projects',
    description: 'Delivery projects per account with status and blocker.',
    fields: {
      id: { label: 'External ID', type: 'string', required: true },
      account_id: { label: 'Account reference', type: 'ref', required: true },
      name: { label: 'Project name', type: 'string', required: true },
      status: { label: 'Status', type: 'enum', values: STATUS_VALUES, required: true },
      blocker_type: { label: 'Blocker type', type: 'enum', values: BLOCKER_VALUES, defaultValue: 'None' },
    },
  },
}

// How non-account rows find their account.
export const ACCOUNT_MATCH = [
  { value: 'same_source', label: 'External ID from this source', help: 'The reference is an account ID from this same connection.' },
  { value: 'any_source', label: 'External ID from any source', help: 'e.g. a warehouse table keyed by Salesforce Account Id.' },
  { value: 'name', label: 'Account name', help: 'Case-insensitive match on account name.' },
]
