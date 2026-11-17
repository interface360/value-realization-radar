import { APP_CONFIG } from '@config/app.config.js'
import { buildSeed as generate, HISTORY_WEEKS } from '../../../shared/demo/generate.js'

// Browser-side demo portfolio (used in "Local demo" data mode).
export { HISTORY_WEEKS }

export const buildSeed = (now = Date.now()) => generate(now, APP_CONFIG.seed)

export async function seedDatabase(tx) {
  const data = buildSeed()
  await Promise.all(Object.entries(data).map(([table, rows]) => tx.table(table).bulkAdd(rows)))
}
