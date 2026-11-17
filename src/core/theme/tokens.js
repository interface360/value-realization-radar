import {
  CircleCheck,
  CircleDot,
  Clock,
  LayoutTemplate,
  LifeBuoy,
  OctagonAlert,
  Package,
  Plug,
  Puzzle,
  Rocket,
  Users,
} from 'lucide-react'

// Chart surface — every mark's 2px separator ring uses this.
export const SURFACE = '#020617'

// Status palette (reserved: never reuse for non-status data). Validated against
// SURFACE for deuteranopia/protanopia/tritanopia separation (worst ΔE 20.3) and
// ≥ 3:1 contrast. Always shipped with an icon + label, never color alone.
export const STATUS_ORDER = ['On Track', 'Delayed', 'Stalled']

export const STATUS = {
  'On Track': { label: 'On Track', tone: 'healthy', color: '#22d3ee', icon: CircleCheck, rank: 0 },
  Delayed: { label: 'Delayed', tone: 'warning', color: '#fbbf24', icon: Clock, rank: 1 },
  Stalled: { label: 'Stalled', tone: 'critical', color: '#f43f5e', icon: OctagonAlert, rank: 2 },
}

export const BLOCKER_ORDER = ['API', 'Template', 'Missing Feature']

export const BLOCKERS = {
  None: { label: 'No blocker', short: 'None', icon: CircleDot },
  API: { label: 'API & Documentation Gaps', short: 'API', icon: Plug },
  Template: { label: 'Template Gaps', short: 'Template', icon: LayoutTemplate },
  'Missing Feature': { label: 'Missing Feature', short: 'Feature', icon: Puzzle },
}

export const INTERVENTIONS = {
  'FDE Deploy': { label: 'Deploy FDE/Builder', short: 'FDE deployed', icon: Rocket },
  'Recovery Plan': { label: 'Initiate Recovery Plan', short: 'Recovery plan', icon: LifeBuoy },
  Packaging: { label: 'Flexible Packaging', short: 'Packaged', icon: Package },
  'Align CS': { label: 'Align CS', short: 'CS aligned', icon: Users },
}
