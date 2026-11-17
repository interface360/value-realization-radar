import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { buildIndex, parsePage } from '../../shared/docs/index.js'

// Loads docs/*.md once at startup (call reload() after editing docs).
export function loadDocs(rootDir) {
  const dir = join(rootDir, 'docs')
  let index = null
  const reload = () => {
    const pages = readdirSync(dir)
      .filter((f) => f.endsWith('.md'))
      .map((f) => parsePage(f.replace(/\.md$/, ''), readFileSync(join(dir, f), 'utf8')))
    index = buildIndex(pages)
    return index
  }
  reload()
  return {
    get index() {
      return index
    },
    reload,
  }
}
