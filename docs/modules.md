---
title: Module development
section: Development
order: 31
summary: Add, version, enable, disable and configure feature modules; the module contract and @core API.
---

# Module development

Every feature in VRR is a **module**: a folder under `src/modules/` that the app discovers automatically.

## Anatomy

```
src/modules/<id>/
├─ manifest.js          identity, slot, icon, shared option schema
├─ shared/              (optional) code shared by all versions
├─ v1/
│  ├─ version.json      semver, status, changelog, version-specific options
│  └─ index.jsx         default export = the component
└─ v2/ …
```

### manifest.js

```js
import { Gauge } from 'lucide-react'
import { defineModule } from '@core'

export default defineModule({
  id: 'churn-forecast',            // must match the folder name
  name: 'Churn Forecast',
  description: 'Predicted renewal outcomes by quarter',
  slot: 'tab',                     // 'tab' | 'header' | 'overlay'
  icon: Gauge,
  order: 50,
  defaultVersion: '1',             // optional; otherwise newest stable
  options: {
    quarters: { type: 'number', label: 'Quarters ahead', default: 4, min: 1, max: 8 },
    showBands: { type: 'boolean', label: 'Confidence bands', default: true },
    model: { type: 'select', label: 'Model', default: 'simple', choices: [{ value: 'simple', label: 'Simple' }] },
  },
})
```

### version.json

```json
{
  "version": "1.0.0",
  "status": "stable",
  "title": "Kanban board",
  "changelog": ["What's new in this version"],
  "options": { "sortBy": { "type": "select", "label": "Sort by", "default": "renewal", "choices": [ … ] } }
}
```

`status` is one of `stable`, `beta`, `experimental` or `deprecated`. Anything other than stable shows a badge on its tab.

### The component contract

```jsx
import { usePortfolio, useWorkspace, startIntervention, Panel, fmt } from '@core'

export default function ChurnForecast({ options, module }) {
  // options: resolved & validated option values
  // module:  { id, name, version }
  const { accounts, summary, loading, error } = usePortfolio()
  const { openAccount, navigate, isEnabled } = useWorkspace()
  …
}
```

## Slots

| Slot | Rendered | Examples |
|---|---|---|
| `tab` | As a tab in the tab bar, one visible at a time | radar, momentum-hub, data-sources, docs |
| `header` | Above the tabs, always visible | kpi-strip |
| `overlay` | Always mounted, for drawers and panels | intervention-drawer, assistant |

## Everyday tasks

| Task | How |
|---|---|
| **Create a module** | `npm run module:new -- churn-forecast --slot tab --name "Churn Forecast"` |
| **Create a new version** | `npm run module:version -- radar` (copies the newest vN → vN+1 as beta) or `--from v1` |
| **List modules** | `npm run module:list` |
| **Enable or disable** | `src/config/modules.config.js` → `{ enabled: false }`, or the Module Manager at runtime |
| **Pin a version** | `{ version: '2' }` or `{ version: '2.0.0-beta.1' }` |
| **Promote a beta** | Set `"status": "stable"` in its `version.json` |
| **Remove a module** | Delete its folder |

## The `@core` API

| Export | Purpose |
|---|---|
| `usePortfolio()` | `{ accounts, summary, loading, error }`: live, derived data from the active backend |
| `useActivity(accountId)` | The account's activity log |
| `startIntervention`, `resolveIntervention`, `logBlocker`, `clearBlocker`, `resetDatabase` | Writes, routed to the active backend |
| `useWorkspace()` | `openAccount(id)`, `closeAccount()`, `navigate(moduleId)`, `isEnabled(id)`, `selectedAccountId` |
| `useDataContext()` | `{ provider, workspace }`. `provider.kind` is `'local'` or `'server'`; `provider.api` is the server client |
| `useWorkspaceSession()` | Saved workspaces: `connect`, `activate`, `forget` |
| `useModules()` | Resolved modules and the override setters |
| `THRESHOLDS`, `STATUS`, `BLOCKERS`, `INTERVENTIONS`, `SURFACE` | Business rules and design tokens |
| `fmt` | `money`, `pct`, `num`, `days`, `relativeTime` |
| UI primitives | `Panel`, `SectionHeader`, `StatusPill`, `BlockerTag`, `InterventionTag`, `Metric`, `RatioBar`, `ActionButton`, `EmptyState`, `Sparkline`, `HoverCard`, `HoverRow`, `Markdown`, `cx`, `useElementSize` |

## Rules

1. **Import only from `@core`** and from your own folder. Never import from another module.
2. **Coordinate through `useWorkspace()`.** For example, call `openAccount(id)`; the drawer, if it is enabled, responds.
3. **Write only through the `@core` actions.** They route to the active backend and record activity.
4. **Status colors are reserved.** Use `STATUS[x].color` only for project status, and always pair it with the icon and label.
5. **Handle `loading` and empty data.** A new tenant starts with no accounts.

## Testing

`npm test` runs `node:test` suites in `scripts/`, `server/` and `shared/`. Put pure logic, such as models and
calculations, in plain `.js` files next to the component so it can be tested without a browser. See
`src/modules/commercial-flexibility/v1/model.js` for an example.
