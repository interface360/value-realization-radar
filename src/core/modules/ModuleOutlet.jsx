// componentFor() returns a cached lazy() per module version, so the component
// identity is stable across renders.
/* oxlint-disable react/static-components */
import { lazy, Suspense } from 'react'
import { ModuleErrorBoundary } from './ModuleErrorBoundary.jsx'

// One lazy component per module version folder, created once and reused.
const lazyCache = new Map()

function componentFor(module) {
  const key = `${module.id}/${module.version.dir}`
  if (!lazyCache.has(key)) lazyCache.set(key, lazy(module.version.load))
  return lazyCache.get(key)
}

function Loading({ module }) {
  return (
    <div className="flex h-full min-h-24 items-center justify-center font-mono text-xs tracking-widest text-slate-500 uppercase">
      <span className="animate-pulse">Loading {module.name}…</span>
    </div>
  )
}

/**
 * Renders a resolved module with the standard props contract:
 *   options — resolved option values (see manifest/version option schema)
 *   module  — { id, name, version } identity of the running instance
 * plus any slot-specific props passed by the shell.
 */
export function ModuleOutlet({ module, fallback, ...slotProps }) {
  // Safe: componentFor returns the same cached lazy() per module version.
  // oxlint-disable-next-line react/static-components
  const Component = componentFor(module)
  const identity = { id: module.id, name: module.name, version: module.version.version }
  return (
    <ModuleErrorBoundary key={`${module.id}@${module.version.version}`} module={identity}>
      <Suspense fallback={fallback ?? <Loading module={module} />}>
        <Component options={module.options} module={identity} {...slotProps} />
      </Suspense>
    </ModuleErrorBoundary>
  )
}
