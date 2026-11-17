import Dexie from 'dexie'
import { APP_CONFIG } from '@config/app.config.js'
import { seedDatabase } from './seed.js'

// Embedded IndexedDB database. To change the schema, add a new
// `db.version(n + 1).stores({...})` block below — never edit an old one.
export const db = new Dexie(APP_CONFIG.dbName)

db.version(1).stores({
  // Spec entities
  accounts: 'id, name, renewal_date',
  telemetry: 'account_id',
  projects: 'id, account_id, status, blocker_type',
  interventions: '++id, account_id, type, status',
  // Supporting entities
  usage: '++id, account_id, [account_id+week]', // weekly consumption history (sparklines, velocity)
  activity: '++id, account_id, at', // audit log of every write made from the UI
})

db.on('populate', (tx) => seedDatabase(tx))

export const TABLES = ['accounts', 'telemetry', 'projects', 'interventions', 'usage', 'activity']
