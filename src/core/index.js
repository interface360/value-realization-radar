// Public API for modules. Modules import from '@core' only — never from another
// module — so any module can be removed, swapped or versioned independently.
export { THRESHOLDS } from '@config/thresholds.js'
export { HISTORY_WEEKS } from './db/seed.js'
// Data access is backend-agnostic: the active workspace decides whether these
// read/write the embedded demo DB or a tenant on the sync server.
export {
  usePortfolio,
  useActivity,
  startIntervention,
  resolveIntervention,
  logBlocker,
  clearBlocker,
  resetDatabase,
} from './data/usePortfolio.js'
export { useDataContext } from './data/context.js'
export { useWorkspaceSession } from './tenancy/useWorkspaceSession.js'
export { deriveAccounts, portfolioSummary, daysUntil } from './metrics/derive.js'
export * as fmt from './metrics/format.js'
export * from './theme/tokens.js'
export { defineModule, useModules } from './modules/index.js'
export { useWorkspace } from './shell/workspace.js'
export * from './ui/primitives.jsx'
export { cx } from './ui/cx.js'
export { Sparkline } from './ui/Sparkline.jsx'
export { HoverCard, HoverRow } from './ui/HoverCard.jsx'
export { Markdown } from './ui/Markdown.jsx'
export { useElementSize } from './ui/useElementSize.js'
