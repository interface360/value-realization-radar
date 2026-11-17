#!/usr/bin/env node
// Module scaffolding.
//   npm run module:new -- <id> [--slot tab|header|overlay] [--name "Display Name"]
//   npm run module:version -- <id> [--from v1] [--status beta]
//   npm run module:list
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'modules')
const [command, id, ...rest] = process.argv.slice(2)
const flag = (name, fallback) => {
  const i = rest.indexOf(`--${name}`)
  return i >= 0 ? rest[i + 1] : fallback
}
const fail = (msg) => {
  console.error(`✖ ${msg}`)
  process.exit(1)
}
const versionDirs = (moduleId) =>
  readdirSync(join(ROOT, moduleId), { withFileTypes: true })
    .filter((d) => d.isDirectory() && existsSync(join(ROOT, moduleId, d.name, 'version.json')))
    .map((d) => d.name)
const pascal = (s) => s.replace(/(^|-)(\w)/g, (_, __, c) => c.toUpperCase())

function newModule() {
  if (!id || !/^[a-z][a-z0-9-]*$/.test(id)) fail('Usage: module:new <kebab-case-id> [--slot tab] [--name "Name"]')
  const dir = join(ROOT, id)
  if (existsSync(dir)) fail(`src/modules/${id} already exists`)
  const slot = flag('slot', 'tab')
  const name = flag('name', pascal(id).replace(/([a-z])([A-Z])/g, '$1 $2'))
  const component = pascal(id)
  mkdirSync(join(dir, 'v1'), { recursive: true })

  writeFileSync(
    join(dir, 'manifest.js'),
    `import { Blocks } from 'lucide-react'
import { defineModule } from '@core'

export default defineModule({
  id: '${id}',
  name: '${name}',
  description: 'TODO: one-line description',
  slot: '${slot}',
  icon: Blocks,
  order: 100,
  options: {
    // example: { type: 'boolean', label: 'Example option', default: true },
  },
})
`,
  )
  writeFileSync(join(dir, 'v1', 'version.json'), `${JSON.stringify({ version: '1.0.0', status: 'experimental', changelog: ['Initial scaffold'] }, null, 2)}\n`)
  writeFileSync(join(dir, 'v1', 'index.jsx'), `export { default } from './${component}.jsx'\n`)
  writeFileSync(
    join(dir, 'v1', `${component}.jsx`),
    `import { Panel, SectionHeader, usePortfolio } from '@core'

export default function ${component}({ options, module }) {
  const { accounts, loading } = usePortfolio()
  if (loading) return null
  return (
    <Panel className="p-5">
      <SectionHeader eyebrow={\`\${module.id} · v\${module.version}\`} title="${name}" />
      <p className="mt-3 text-sm text-slate-400">{accounts.length} accounts loaded. Build your view here.</p>
    </Panel>
  )
}
`,
  )
  console.log(`✔ Created src/modules/${id} (${slot} slot, v1.0.0 experimental)`)
  console.log(`  It is live immediately. Add '${id}': { enabled: true } to src/config/modules.config.js to pin settings.`)
}

function newVersion() {
  if (!id || !existsSync(join(ROOT, id, 'manifest.js'))) fail(`Usage: module:version <existing-module-id> [--from vN] [--status beta]`)
  const dirs = versionDirs(id).sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)))
  const from = flag('from', dirs.at(-1))
  if (!dirs.includes(from)) fail(`No version folder ${from} in ${id} (have: ${dirs.join(', ')})`)
  const nextMajor = Math.max(...dirs.map((d) => Number(d.slice(1)))) + 1
  const to = `v${nextMajor}`
  cpSync(join(ROOT, id, from), join(ROOT, id, to), { recursive: true })
  const metaPath = join(ROOT, id, to, 'version.json')
  const meta = JSON.parse(readFileSync(metaPath, 'utf8'))
  meta.version = `${nextMajor}.0.0-beta.1`
  meta.status = flag('status', 'beta')
  meta.changelog = [`Forked from ${from}`]
  writeFileSync(metaPath, `${JSON.stringify(meta, null, 2)}\n`)
  console.log(`✔ Created src/modules/${id}/${to} (${meta.version}, ${meta.status}) from ${from}`)
  console.log(`  ${from} stays the default. Switch in the Module Manager, or set version: '${nextMajor}' in modules.config.js.`)
}

function list() {
  for (const moduleId of readdirSync(ROOT).filter((d) => existsSync(join(ROOT, d, 'manifest.js')))) {
    const versions = versionDirs(moduleId).map((d) => {
      const m = JSON.parse(readFileSync(join(ROOT, moduleId, d, 'version.json'), 'utf8'))
      return `${m.version} (${m.status ?? 'stable'})`
    })
    console.log(`${moduleId.padEnd(26)} ${versions.join(', ')}`)
  }
}

const commands = { new: newModule, version: newVersion, list }
;(commands[command] ?? (() => fail('Commands: new, version, list')))()
