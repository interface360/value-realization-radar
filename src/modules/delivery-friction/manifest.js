import { Grid2x2 } from 'lucide-react'
import { defineModule } from '@core'

export default defineModule({
  id: 'delivery-friction',
  name: 'Delivery Friction',
  description: 'Product feedback loop: ARR stalled per blocker type',
  slot: 'tab',
  icon: Grid2x2,
  order: 30,
  options: {
    attribution: {
      type: 'select',
      label: 'ARR attribution',
      default: 'full',
      help: 'Full: an account counts its whole ARR under every blocker it has. Split: ARR is divided across its blockers so tiles sum to the total.',
      choices: [
        { value: 'full', label: 'Full ARR per blocker' },
        { value: 'split', label: 'Split across blockers' },
      ],
    },
    showAccounts: { type: 'boolean', label: 'Show account tiles inside blockers', default: true },
  },
})
