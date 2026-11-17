export { buildRegistry, resolveModules, compareSemver } from './registry.js'
export { ModuleProvider } from './ModuleProvider.jsx'
export { ModuleOutlet } from './ModuleOutlet.jsx'
export { useModules } from './context.js'

/**
 * Identity helper for manifests — gives editors a single place to document the shape.
 *
 * @param {object} manifest
 * @param {string} manifest.id               must match the folder name
 * @param {string} manifest.name
 * @param {string} [manifest.description]
 * @param {'header'|'tab'|'overlay'} manifest.slot
 * @param {import('react').ComponentType} [manifest.icon]
 * @param {number} [manifest.order]          sort order within the slot
 * @param {boolean} [manifest.enabledByDefault]
 * @param {string} [manifest.defaultVersion] e.g. '1' or '1.2.0'; otherwise latest stable
 * @param {Record<string, OptionSchema>} [manifest.options]
 *
 * @typedef {{ type: 'boolean', label: string, default: boolean, help?: string }
 *   | { type: 'number', label: string, default: number, min: number, max: number, step?: number, unit?: string, help?: string }
 *   | { type: 'select', label: string, default: string, choices: { value: string, label: string }[], help?: string }} OptionSchema
 */
export const defineModule = (manifest) => manifest
