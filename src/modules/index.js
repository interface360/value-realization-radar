import { buildRegistry } from '@core/modules/registry.js'

// Auto-discovery: any folder in src/modules with a manifest.js and at least one
// <version-dir>/version.json + <version-dir>/index.jsx is registered. Nothing to
// import or wire by hand — add a folder to add a module, delete it to remove it.
export const registry = buildRegistry({
  manifests: import.meta.glob('./*/manifest.js', { eager: true, import: 'default' }),
  versionMeta: import.meta.glob('./*/*/version.json', { eager: true, import: 'default' }),
  entries: import.meta.glob('./*/*/index.jsx'),
})
