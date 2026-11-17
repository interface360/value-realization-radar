// ─────────────────────────────────────────────────────────────────────────────
// Module configuration — the single place to enable/disable features, pin
// versions, reorder tabs and set option defaults.
//
// Resolution order (later wins):
//   1. manifest defaults   (src/modules/<id>/manifest.js)
//   2. this file
//   3. runtime overrides   (Module Manager panel → localStorage)
//
// Keys are module ids. Every field is optional.
//   enabled  boolean          turn the module on/off
//   version  'x.y.z'          pin a version declared in the manifest
//   order    number           sort order within its slot (tabs: left → right)
//   options  { [key]: value } override option defaults declared in the manifest
//   locked   boolean          hide the module from runtime overrides
// ─────────────────────────────────────────────────────────────────────────────
export const MODULES_CONFIG = {
  'kpi-strip': { enabled: true },
  radar: { enabled: true, order: 10 },
  'momentum-hub': { enabled: true, version: '1.0.0', order: 20 },
  'delivery-friction': { enabled: true, order: 30 },
  'commercial-flexibility': { enabled: true, order: 40 },
  'intervention-drawer': { enabled: true },
  'data-sources': { enabled: true, order: 90 },
  docs: { enabled: true, order: 95 },
  assistant: { enabled: true },
}
