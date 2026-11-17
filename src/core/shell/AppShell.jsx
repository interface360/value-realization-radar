import { useCallback, useEffect, useMemo, useState } from 'react'
import { Boxes, CloudOff, PlugZap } from 'lucide-react'
import { useDataContext } from '../data/context.js'
import { usePortfolio } from '../data/usePortfolio.js'
import { ModuleOutlet } from '../modules/ModuleOutlet.jsx'
import { useModules } from '../modules/context.js'
import { EmptyState } from '../ui/primitives.jsx'
import { Header } from './Header.jsx'
import { ModuleManager } from './ModuleManager.jsx'
import { TabBar } from './TabBar.jsx'
import { WorkspaceContext } from './workspace.js'

const TAB_KEY = 'vrr.active-tab'

// A freshly created tenant has no synced data yet — point to Data Sources.
function EmptyWorkspaceBanner({ onOpenSources, canOpen }) {
  const { provider, workspace } = useDataContext()
  const { accounts, loading, error } = usePortfolio()
  if (provider.kind !== 'server' || loading) return null
  if (error) {
    return (
      <div className="mb-4 flex items-center gap-3 rounded-xl bg-rose-500/10 px-4 py-3 text-sm text-rose-200 ring-1 ring-rose-500/30">
        <CloudOff className="size-4 shrink-0" />
        {error.message}
      </div>
    )
  }
  if (accounts.length) return null
  return (
    <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl bg-cyan-400/5 px-4 py-3 text-sm text-slate-300 ring-1 ring-cyan-400/20">
      <PlugZap className="size-4 shrink-0 text-cyan-300" />
      <span>
        <span className="text-slate-100">{workspace.tenant.name}</span> has no synced accounts yet. Connect a CRM and run a pull to populate the radar.
      </span>
      {canOpen && (
        <button type="button" onClick={onOpenSources} className="ml-auto rounded-lg bg-cyan-400/15 px-3 py-1.5 text-xs font-medium text-cyan-100 ring-1 ring-cyan-400/30 hover:bg-cyan-400/25">
          Open Data Sources
        </button>
      )}
    </div>
  )
}

export function AppShell() {
  const { inSlot, isEnabled } = useModules()
  const headers = inSlot('header')
  const tabs = inSlot('tab')
  const overlays = inSlot('overlay')

  const [requestedTab, setRequestedTab] = useState(() => localStorage.getItem(TAB_KEY))
  const [selectedAccountId, setSelectedAccountId] = useState(null)
  const [managerOpen, setManagerOpen] = useState(false)

  // Fall back to the first enabled tab when the stored one is disabled/removed.
  const activeTab = tabs.find((t) => t.id === requestedTab) ?? tabs[0] ?? null

  useEffect(() => {
    if (activeTab) localStorage.setItem(TAB_KEY, activeTab.id)
  }, [activeTab])

  // The drawer is the only consumer of `selectedAccountId` today; if no enabled
  // overlay module handles accounts, clicks become no-ops instead of errors.
  const canOpenAccount = overlays.some((m) => m.id === 'intervention-drawer')

  const activeTabId = activeTab?.id ?? null
  const openAccount = useCallback((id) => canOpenAccount && setSelectedAccountId(id), [canOpenAccount])
  const closeAccount = useCallback(() => setSelectedAccountId(null), [])
  const navigate = useCallback(
    (moduleId) => {
      if (!isEnabled(moduleId)) return false
      setRequestedTab(moduleId)
      return true
    },
    [isEnabled],
  )

  // Panels toggled from the header (e.g. the Assistant overlay) and doc deep-links.
  const [openPanel, setOpenPanel] = useState(null)
  const [docTarget, setDocTarget] = useState(null)
  const togglePanel = useCallback((id) => setOpenPanel((p) => (p === id ? null : id)), [])
  const closePanel = useCallback(() => setOpenPanel(null), [])
  const openDoc = useCallback(
    (page, anchor) => {
      if (!isEnabled('docs')) return false
      setDocTarget({ page: page ?? 'README', anchor: anchor ?? null, at: Date.now() })
      setRequestedTab('docs')
      return true
    },
    [isEnabled],
  )

  const workspace = useMemo(
    () => ({ selectedAccountId, canOpenAccount, openAccount, closeAccount, activeTabId, navigate, isEnabled, openPanel, togglePanel, closePanel, docTarget, openDoc }),
    [selectedAccountId, canOpenAccount, openAccount, closeAccount, activeTabId, navigate, isEnabled, openPanel, togglePanel, closePanel, docTarget, openDoc],
  )

  return (
    <WorkspaceContext.Provider value={workspace}>
      <div className="relative flex min-h-screen flex-col bg-slate-950 text-slate-200">
        <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(ellipse_at_top,rgba(34,211,238,0.08),transparent_60%)]" />
        <Header onOpenManager={() => setManagerOpen(true)} />

        <main className="relative mx-auto flex w-full max-w-[1600px] flex-1 flex-col gap-4 px-4 pb-6 sm:px-6">
          {headers.map((m) => (
            <ModuleOutlet key={m.id} module={m} fallback={<div className="h-20" />} />
          ))}

          {tabs.length > 0 && <TabBar tabs={tabs} activeId={activeTab?.id} onSelect={setRequestedTab} />}

          <section className="flex min-h-[560px] flex-1 flex-col">
            {activeTab && activeTab.id !== 'data-sources' && <EmptyWorkspaceBanner onOpenSources={() => navigate('data-sources')} canOpen={isEnabled('data-sources')} />}
            {activeTab ? (
              <ModuleOutlet key={activeTab.id} module={activeTab} />
            ) : (
              <EmptyState icon={Boxes} title="No views enabled">
                Turn a view back on from the Module Manager, or in src/config/modules.config.js.
              </EmptyState>
            )}
          </section>
        </main>

        {overlays.map((m) => (
          <ModuleOutlet key={m.id} module={m} fallback={null} />
        ))}

        <ModuleManager open={managerOpen} onClose={() => setManagerOpen(false)} />
      </div>
    </WorkspaceContext.Provider>
  )
}
