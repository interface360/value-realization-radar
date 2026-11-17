import { useEffect, useMemo, useRef, useState } from 'react'
import { BookOpen, ChevronRight, Search, Sparkles, X } from 'lucide-react'
import { cx, Markdown, Panel, useModules, useWorkspace } from '@core'
import { buildIndex, navigation, parsePage, slugify } from '../../../../shared/docs/index.js'

// docs/*.md are bundled at build time, so docs work without the sync server.
const RAW = import.meta.glob('../../../../docs/*.md', { eager: true, query: '?raw', import: 'default' })
const PAGES = Object.entries(RAW).map(([path, raw]) => parsePage(path.split('/').pop().replace(/\.md$/, ''), raw))
const INDEX = buildIndex(PAGES)
const NAV = navigation(PAGES)
const BY_SLUG = new Map(PAGES.map((p) => [p.slug.toLowerCase(), p]))

const findPage = (slug) => BY_SLUG.get(String(slug ?? '').toLowerCase()) ?? BY_SLUG.get('readme') ?? PAGES[0]

function SearchResults({ query, onOpen }) {
  const results = useMemo(() => INDEX.search(query, { limit: 12 }), [query])
  if (!results.length) return <p className="px-2 py-6 text-center text-sm text-slate-500">No matches for “{query}”.</p>
  return (
    <ul className="space-y-1">
      {results.map((r) => (
        <li key={`${r.slug}#${r.anchor}`}>
          <button type="button" onClick={() => onOpen(r.slug, r.anchor)} className="w-full rounded-lg px-3 py-2 text-left hover:bg-white/5">
            <p className="text-sm text-slate-100">
              {r.heading}
              <span className="ml-2 text-xs text-slate-500">{r.title}</span>
            </p>
            <p className="line-clamp-2 text-xs text-slate-400">{r.text.replace(/[#*`|>-]/g, ' ').replace(/\s+/g, ' ').slice(0, 220)}</p>
          </button>
        </li>
      ))}
    </ul>
  )
}

export default function DocsViewer({ options }) {
  const { docTarget, togglePanel, openAccount } = useWorkspace()
  const { isEnabled } = useModules()
  const [slug, setSlug] = useState(() => docTarget?.page ?? 'README')
  const [anchor, setAnchor] = useState(() => docTarget?.anchor ?? null)
  const [query, setQuery] = useState('')
  const contentRef = useRef(null)
  const page = findPage(slug)

  // Deep links from the assistant (or anywhere else).
  const [seenTarget, setSeenTarget] = useState(docTarget?.at)
  if (docTarget && docTarget.at !== seenTarget) {
    setSeenTarget(docTarget.at)
    setSlug(docTarget.page)
    setAnchor(docTarget.anchor)
    setQuery('')
  }

  const open = (nextSlug, nextAnchor) => {
    setSlug(nextSlug ?? page.slug)
    setAnchor(nextAnchor ?? null)
    setQuery('')
  }

  // Scroll to the anchor once the page has rendered.
  useEffect(() => {
    const root = contentRef.current
    if (!root) return
    if (!anchor) {
      root.scrollTop = 0
      return
    }
    const target = [...root.querySelectorAll('h1,h2,h3')].find((h) => slugify(h.textContent) === anchor)
    target?.scrollIntoView({ block: 'start' })
  }, [slug, anchor])

  return (
    <div className="grid flex-1 gap-4 lg:grid-cols-[17rem_minmax(0,1fr)]">
      <Panel className="flex flex-col p-3 lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:self-start">
        <div className="mb-3 flex items-center gap-2 px-2 pt-1">
          <BookOpen className="size-4 text-cyan-300" />
          <p className="text-sm font-semibold text-slate-100">Documentation</p>
        </div>
        {options.showSearch && (
          <div className="relative mb-3">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-slate-500" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search docs…"
              aria-label="Search documentation"
              className="w-full rounded-lg bg-slate-950/60 py-2 pr-7 pl-8 text-sm text-slate-100 ring-1 ring-white/10 outline-none placeholder:text-slate-600 focus:ring-cyan-400/50"
            />
            {query && (
              <button type="button" onClick={() => setQuery('')} aria-label="Clear search" className="absolute top-1/2 right-2 -translate-y-1/2 text-slate-500 hover:text-slate-200">
                <X className="size-3.5" />
              </button>
            )}
          </div>
        )}
        <nav className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1" aria-label="Documentation pages">
          {NAV.map(({ section, items }) => (
            <div key={section}>
              <p className="mb-1 px-2 font-mono text-[10px] tracking-[0.2em] text-slate-500 uppercase">{section}</p>
              <ul>
                {items.map((p) => (
                  <li key={p.slug}>
                    <button
                      type="button"
                      onClick={() => open(p.slug)}
                      aria-current={p.slug === page.slug ? 'page' : undefined}
                      className={cx('flex w-full items-center gap-1 rounded-md px-2 py-1.5 text-left text-sm transition', p.slug === page.slug ? 'bg-cyan-400/10 text-cyan-100' : 'text-slate-400 hover:bg-white/5 hover:text-slate-200')}
                    >
                      <ChevronRight className={cx('size-3 shrink-0 transition', p.slug === page.slug ? 'text-cyan-300' : 'text-transparent')} />
                      {p.title}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
        {isEnabled('assistant') && (
          <button type="button" onClick={() => togglePanel('assistant')} className="mt-3 inline-flex items-center justify-center gap-2 rounded-lg bg-violet-400/10 px-3 py-2 text-xs text-violet-100 ring-1 ring-violet-400/30 hover:bg-violet-400/20">
            <Sparkles className="size-3.5" /> Ask the assistant
          </button>
        )}
      </Panel>

      <Panel className="min-w-0 p-6 sm:p-8">
        <div ref={contentRef} className="max-h-[calc(100vh-14rem)] overflow-y-auto pr-2">
          {query ? (
            <>
              <p className="mb-3 font-mono text-[10px] tracking-[0.25em] text-cyan-300/70 uppercase">Search results</p>
              <SearchResults query={query} onOpen={open} />
            </>
          ) : (
            <>
              <p className="mb-2 font-mono text-[10px] tracking-[0.25em] text-cyan-300/70 uppercase">{page.section}</p>
              {page.summary && <p className="mb-6 text-sm text-slate-400">{page.summary}</p>}
              <Markdown onDocLink={(p, a) => open(p, a)} onAccountLink={openAccount}>
                {page.body}
              </Markdown>
            </>
          )}
        </div>
      </Panel>
    </div>
  )
}
