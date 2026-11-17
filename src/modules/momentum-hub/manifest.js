import { Columns3 } from 'lucide-react'
import { defineModule } from '@core'

export default defineModule({
  id: 'momentum-hub',
  name: 'Momentum Hub',
  description: 'Intervention engine for CS & account teams',
  slot: 'tab',
  icon: Columns3,
  order: 20,
  // Options shared by every version. Version-specific options live in version.json.
  options: {
    includeDelayed: { type: 'boolean', label: 'Include amber (Delayed) accounts', default: true },
  },
})
