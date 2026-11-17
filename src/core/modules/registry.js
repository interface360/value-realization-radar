// Builds the module registry from Vite glob results and resolves the effective
// state (enabled, version, options) of each module from three layers:
//   manifest defaults → modules.config.js → runtime overrides.

const SEMVER = /^(\d+)\.(\d+)\.(\d+)(?:-([\w.]+))?$/
export const SLOTS = ['header', 'tab', 'overlay']
export const VERSION_STATUSES = ['stable', 'beta', 'experimental', 'deprecated']

function parseSemver(v) {
  const m = SEMVER.exec(v ?? '')
  return m ? { major: +m[1], minor: +m[2], patch: +m[3], pre: m[4] ?? null } : null
}

export function compareSemver(a, b) {
  const x = parseSemver(a)
  const y = parseSemver(b)
  return x.major - y.major || x.minor - y.minor || x.patch - y.patch || (x.pre ? -1 : 0) - (y.pre ? -1 : 0)
}

const segments = (path) => path.replace(/^\.\//, '').split('/')

/**
 * @param {object} globs
 * @param {Record<string, object>} globs.manifests    './<id>/manifest.js'        → manifest
 * @param {Record<string, object>} globs.versionMeta  './<id>/<dir>/version.json' → { version, status, changelog, options }
 * @param {Record<string, Function>} globs.entries     './<id>/<dir>/index.jsx'    → () => import()
 */
export function buildRegistry({ manifests, versionMeta, entries }) {
  const registry = new Map()
  const problems = []

  for (const [path, manifest] of Object.entries(manifests)) {
    const [folder] = segments(path)
    if (manifest.id !== folder) problems.push(`${path}: manifest id "${manifest.id}" must match folder name "${folder}"`)
    if (!SLOTS.includes(manifest.slot)) problems.push(`${path}: unknown slot "${manifest.slot}" (expected ${SLOTS.join(', ')})`)
    registry.set(folder, { manifest, versions: [] })
  }

  for (const [path, meta] of Object.entries(versionMeta)) {
    const [folder, dir] = segments(path)
    const mod = registry.get(folder)
    if (!mod) {
      problems.push(`${path}: version without a manifest.js in src/modules/${folder}`)
      continue
    }
    const parsed = parseSemver(meta.version)
    const load = entries[`./${folder}/${dir}/index.jsx`]
    if (!parsed) problems.push(`${path}: "${meta.version}" is not a valid semver`)
    if (!load) problems.push(`${path}: missing ${dir}/index.jsx entry`)
    if (!parsed || !load) continue
    mod.versions.push({
      dir,
      version: meta.version,
      major: parsed.major,
      status: VERSION_STATUSES.includes(meta.status) ? meta.status : 'stable',
      title: meta.title ?? null,
      changelog: meta.changelog ?? [],
      options: meta.options ?? {},
      load,
    })
  }

  for (const [id, mod] of registry) {
    mod.versions.sort((a, b) => compareSemver(b.version, a.version))
    const majors = mod.versions.map((v) => v.major)
    if (new Set(majors).size !== majors.length) problems.push(`${id}: two version folders share a major version`)
    if (!mod.versions.length) {
      problems.push(`${id}: no versions found — module skipped`)
      registry.delete(id)
    }
  }

  if (problems.length) console.warn(`[modules] ${problems.length} registry problem(s):\n  - ${problems.join('\n  - ')}`)
  return registry
}

// Accepts 2 | '2' | 'v2' | '2.x' (latest of that major) or an exact '2.1.0'.
function matchVersion(versions, spec) {
  if (spec == null || spec === '') return null
  const s = String(spec).trim()
  const major = /^v?(\d+)(?:\.x)?$/.exec(s)
  if (major) return versions.find((v) => v.major === +major[1]) ?? null
  return versions.find((v) => v.version === s.replace(/^v/, '')) ?? null
}

// manifest.defaultVersion → newest stable → oldest version (so a freshly forked
// beta never becomes the default by accident).
function defaultVersion(mod) {
  return (
    matchVersion(mod.versions, mod.manifest.defaultVersion) ??
    mod.versions.find((v) => v.status === 'stable') ??
    mod.versions.at(-1)
  )
}

function coerceOption(schema, value) {
  if (value === undefined) return schema.default
  switch (schema.type) {
    case 'boolean':
      return Boolean(value)
    case 'number': {
      const n = Number(value)
      if (Number.isNaN(n)) return schema.default
      return Math.min(schema.max ?? Infinity, Math.max(schema.min ?? -Infinity, n))
    }
    case 'select':
      return schema.choices.some((c) => c.value === value) ? value : schema.default
    default:
      return value
  }
}

export function resolveModules(registry, config = {}, overrides = {}) {
  const resolved = []
  for (const [id, { manifest, versions }] of registry) {
    const cfg = config[id] ?? {}
    const locked = Boolean(cfg.locked)
    const ovr = locked ? {} : (overrides[id] ?? {})

    let version = defaultVersion({ manifest, versions })
    let versionWarning = null
    for (const spec of [cfg.version, ovr.version]) {
      if (spec == null) continue
      const match = matchVersion(versions, spec)
      if (match) version = match
      else versionWarning = `Version "${spec}" not found — using ${version.version}`
    }
    if (versionWarning) console.warn(`[modules] ${id}: ${versionWarning}`)

    const optionSchema = { ...(manifest.options ?? {}), ...version.options }
    const options = {}
    for (const [key, schema] of Object.entries(optionSchema)) {
      const raw = ovr.options?.[key] ?? cfg.options?.[key]
      options[key] = coerceOption(schema, raw)
    }

    resolved.push({
      id,
      name: manifest.name,
      description: manifest.description ?? '',
      icon: manifest.icon ?? null,
      slot: manifest.slot,
      order: ovr.order ?? cfg.order ?? manifest.order ?? 100,
      enabled: ovr.enabled ?? cfg.enabled ?? manifest.enabledByDefault ?? true,
      locked,
      version,
      versions,
      versionWarning,
      optionSchema,
      options,
      isOverridden: Object.keys(ovr).length > 0,
    })
  }
  return resolved.sort((a, b) => a.order - b.order || a.name.localeCompare(b.name))
}
