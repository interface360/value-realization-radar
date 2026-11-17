// Embedded demo database. Modules should use the backend-agnostic actions
// exported from '@core' (src/core/data/usePortfolio.js), not these directly.
export { db } from './schema.js'
export { HISTORY_WEEKS } from './seed.js'
