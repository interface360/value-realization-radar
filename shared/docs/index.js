// Documentation index shared by the Docs viewer (browser) and the assistant's
// retrieval (server). Pages are Markdown with a small YAML-ish front-matter.

export function parsePage(slug, raw) {
  const m = /^---\n([\s\S]*?)\n---\n?/.exec(raw)
  const meta = {}
  if (m) {
    for (const line of m[1].split('\n')) {
      const i = line.indexOf(':')
      if (i > 0) meta[line.slice(0, i).trim()] = line.slice(i + 1).trim()
    }
  }
  const body = m ? raw.slice(m[0].length) : raw
  const title = meta.title ?? /^#\s+(.+)$/m.exec(body)?.[1] ?? slug
  return { slug, title, section: meta.section ?? 'Other', order: Number(meta.order ?? 99), summary: meta.summary ?? '', body }
}

// Split a page into heading-delimited chunks for retrieval.
export function chunkPage(page) {
  const chunks = []
  let heading = page.title
  let anchor = ''
  let buf = []
  let inFence = false
  const flush = () => {
    const text = buf.join('\n').trim()
    if (text) chunks.push({ slug: page.slug, title: page.title, heading, anchor, text })
    buf = []
  }
  for (const line of page.body.split('\n')) {
    if (line.startsWith('```')) inFence = !inFence
    const h = !inFence && /^(#{1,3})\s+(.+)$/.exec(line)
    if (h) {
      flush()
      heading = h[2].trim()
      anchor = slugify(heading)
      continue
    }
    buf.push(line)
  }
  flush()
  return chunks
}

export const slugify = (s) =>
  String(s)
    .toLowerCase()
    .replace(/[`*_~[\]()]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')

const STOP = new Set('a an and are as at be by can do does for from how i in is it my of on or the to what when where which who why with you your vrr'.split(' '))
const tokenize = (s) =>
  String(s)
    .toLowerCase()
    .replace(/[^a-z0-9%$]+/g, ' ')
    .split(' ')
    .filter((t) => t.length > 1 && !STOP.has(t))
// Navigation/history pages mention everything but explain little.
const PAGE_WEIGHT = { README: 0.4, CHANGELOG: 0.4 }

// Light stemming so "mapping" ≈ "map", "accounts" ≈ "account".
const stem = (t) => t.replace(/(ings?|ed|es|s)$/, '') || t

export function buildIndex(pages) {
  const chunks = pages.flatMap(chunkPage)
  const docs = chunks.map((c) => {
    const terms = new Map()
    const add = (text, weight) => {
      for (const t of tokenize(text).map(stem)) terms.set(t, (terms.get(t) ?? 0) + weight)
    }
    add(c.title, 3)
    add(c.heading, 4)
    add(c.text, 1)
    return { chunk: c, terms, length: [...terms.values()].reduce((a, b) => a + b, 0) }
  })
  const df = new Map()
  for (const d of docs) for (const t of d.terms.keys()) df.set(t, (df.get(t) ?? 0) + 1)
  const avgLen = docs.reduce((s, d) => s + d.length, 0) / Math.max(1, docs.length)
  const N = docs.length

  // BM25 ranking, plus a boost for chunks containing adjacent query-word pairs
  // ("arr at risk", "pulsing ring") and a penalty for index/changelog pages.
  function search(query, { limit = 5 } = {}) {
    const q = [...new Set(tokenize(query).map(stem))]
    if (!q.length) return []
    const k1 = 1.4
    const b = 0.7
    const words = String(query).toLowerCase().replace(/[^a-z0-9%$ ]+/g, ' ').split(/\s+/).filter(Boolean)
    const bigrams = words.slice(1).map((w, i) => `${words[i]} ${w}`).filter((p) => p.split(' ').some((w) => !STOP.has(w)))
    return docs
      .map((d) => {
        let score = 0
        for (const t of q) {
          const tf = d.terms.get(t)
          if (!tf) continue
          const idf = Math.log(1 + (N - df.get(t) + 0.5) / (df.get(t) + 0.5))
          score += idf * ((tf * (k1 + 1)) / (tf + k1 * (1 - b + (b * d.length) / avgLen)))
        }
        if (score > 0) {
          const hay = `${d.chunk.heading}\n${d.chunk.text}`.toLowerCase()
          for (const bg of bigrams) if (hay.includes(bg)) score *= 1.25
          score *= PAGE_WEIGHT[d.chunk.slug] ?? 1
        }
        return { ...d.chunk, score }
      })
      .filter((r) => r.score > 0)
      .sort((x, y) => y.score - x.score)
      .slice(0, limit)
  }

  return { pages, chunks, search }
}

// Ordered navigation: sections in first-seen order of their lowest page order.
export function navigation(pages) {
  const sorted = [...pages].sort((a, b) => a.order - b.order || a.title.localeCompare(b.title))
  const sections = new Map()
  for (const p of sorted) {
    if (!sections.has(p.section)) sections.set(p.section, [])
    sections.get(p.section).push(p)
  }
  return [...sections].map(([section, items]) => ({ section, items }))
}
