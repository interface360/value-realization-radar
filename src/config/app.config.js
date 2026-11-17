// Global, non-module settings. Module-level settings live in modules.config.js.
export const APP_CONFIG = {
  name: 'Value Realization Radar',
  tagline: 'Adoption is the earliest renewal signal',
  // Bump the suffix to start from a fresh IndexedDB without touching the old one.
  dbName: 'value-realization-radar',
  // localStorage key for runtime module overrides made in the Module Manager.
  moduleOverridesKey: 'vrr.module-overrides.v1',
  // Deterministic mock data: same seed → same demo portfolio.
  seed: 20261104,
  // Default sync server for connecting a tenant workspace (npm run server).
  syncServerUrl: import.meta.env.VITE_VRR_SERVER_URL ?? 'http://localhost:8787',
}
