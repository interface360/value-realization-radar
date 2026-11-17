import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

// Minimal .env loader: reads .env then .env.local from the project root.
// Real environment variables always win; files never override them.
export function loadEnvFiles(rootDir) {
  const loaded = []
  for (const name of ['.env', '.env.local']) {
    const file = join(rootDir, name)
    if (!existsSync(file)) continue
    for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
      const m = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/.exec(line)
      if (!m || line.trimStart().startsWith('#')) continue
      let value = m[2]
      if (/^(['"]).*\1$/.test(value)) value = value.slice(1, -1)
      else value = value.replace(/\s+#.*$/, '')
      if (process.env[m[1]] === undefined) process.env[m[1]] = value
    }
    loaded.push(name)
  }
  return loaded
}
