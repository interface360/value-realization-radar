// Run: npm test   (node:test, no extra deps)
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildRegistry, compareSemver, resolveModules } from '../src/core/modules/registry.js'

const load = () => Promise.resolve({ default: () => null })

function fixture() {
  return buildRegistry({
    manifests: {
      './alpha/manifest.js': { id: 'alpha', name: 'Alpha', slot: 'tab', order: 2, options: { flag: { type: 'boolean', default: true } } },
      './beta/manifest.js': { id: 'beta', name: 'Beta', slot: 'tab', order: 1, enabledByDefault: false },
    },
    versionMeta: {
      './alpha/v1/version.json': { version: '1.2.0', status: 'stable' },
      './alpha/v2/version.json': {
        version: '2.0.0-beta.1',
        status: 'beta',
        options: { size: { type: 'number', default: 5, min: 1, max: 10 } },
      },
      './beta/v1/version.json': { version: '1.0.0' },
    },
    entries: { './alpha/v1/index.jsx': load, './alpha/v2/index.jsx': load, './beta/v1/index.jsx': load },
  })
}

test('semver ordering treats prereleases as lower', () => {
  assert.ok(compareSemver('2.0.0-beta.1', '2.0.0') < 0)
  assert.ok(compareSemver('2.0.0-beta.1', '1.9.9') > 0)
})

test('defaults: newest stable version, manifest enabled flag, manifest order', () => {
  const [beta, alpha] = resolveModules(fixture())
  assert.equal(alpha.version.version, '1.2.0')
  assert.equal(alpha.enabled, true)
  assert.equal(beta.enabled, false)
  assert.deepEqual(alpha.options, { flag: true })
})

test('config pins a version by major and exposes version-specific options', () => {
  const alpha = resolveModules(fixture(), { alpha: { version: '2' } }).find((m) => m.id === 'alpha')
  assert.equal(alpha.version.version, '2.0.0-beta.1')
  assert.deepEqual(alpha.options, { flag: true, size: 5 })
})

test('runtime overrides beat config; options are clamped', () => {
  const alpha = resolveModules(fixture(), { alpha: { enabled: true, options: { size: 3 } } }, { alpha: { enabled: false, version: '2.0.0-beta.1', options: { size: 99 } } }).find(
    (m) => m.id === 'alpha',
  )
  assert.equal(alpha.enabled, false)
  assert.equal(alpha.options.size, 10)
})

test('locked modules ignore runtime overrides', () => {
  const alpha = resolveModules(fixture(), { alpha: { locked: true } }, { alpha: { enabled: false } }).find((m) => m.id === 'alpha')
  assert.equal(alpha.enabled, true)
})

test('unknown version falls back with a warning', () => {
  const alpha = resolveModules(fixture(), { alpha: { version: '9' } }).find((m) => m.id === 'alpha')
  assert.equal(alpha.version.version, '1.2.0')
  assert.match(alpha.versionWarning, /not found/)
})

test('order override reorders tabs', () => {
  const ids = resolveModules(fixture(), { alpha: { order: 0 } }).map((m) => m.id)
  assert.deepEqual(ids, ['alpha', 'beta'])
})
