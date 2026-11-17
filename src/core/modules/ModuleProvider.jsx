import { useCallback, useMemo, useState } from 'react'
import { APP_CONFIG } from '@config/app.config.js'
import { MODULES_CONFIG } from '@config/modules.config.js'
import { ModuleContext } from './context.js'
import { resolveModules } from './registry.js'

function readOverrides() {
  try {
    return JSON.parse(localStorage.getItem(APP_CONFIG.moduleOverridesKey)) ?? {}
  } catch {
    return {}
  }
}

export function ModuleProvider({ registry, config = MODULES_CONFIG, children }) {
  const [overrides, setOverrides] = useState(readOverrides)

  const persist = useCallback((next) => {
    localStorage.setItem(APP_CONFIG.moduleOverridesKey, JSON.stringify(next))
    return next
  }, [])

  // patch: { enabled?, version?, options?: {...} } — options are merged, not replaced.
  const setOverride = useCallback(
    (id, patch) =>
      setOverrides((prev) => {
        const current = prev[id] ?? {}
        const merged = { ...current, ...patch }
        if (patch.options) merged.options = { ...current.options, ...patch.options }
        return persist({ ...prev, [id]: merged })
      }),
    [persist],
  )

  const resetOverride = useCallback(
    (id) =>
      setOverrides((prev) => {
        const next = { ...prev }
        delete next[id]
        return persist(next)
      }),
    [persist],
  )

  const resetAll = useCallback(() => setOverrides(persist({})), [persist])

  const value = useMemo(() => {
    const modules = resolveModules(registry, config, overrides)
    const byId = new Map(modules.map((m) => [m.id, m]))
    return {
      modules,
      get: (id) => byId.get(id) ?? null,
      isEnabled: (id) => Boolean(byId.get(id)?.enabled),
      inSlot: (slot) => modules.filter((m) => m.slot === slot && m.enabled),
      setOverride,
      resetOverride,
      resetAll,
    }
  }, [registry, config, overrides, setOverride, resetOverride, resetAll])

  return <ModuleContext.Provider value={value}>{children}</ModuleContext.Provider>
}
