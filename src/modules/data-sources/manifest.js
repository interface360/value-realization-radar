import { PlugZap } from 'lucide-react'
import { defineModule } from '@core'

export default defineModule({
  id: 'data-sources',
  name: 'Data Sources',
  description: 'Connect CRMs, map their fields to VRR and pull data on a schedule',
  slot: 'tab',
  icon: PlugZap,
  order: 90,
  options: {
    sampleSize: { type: 'number', label: 'Preview sample size', default: 25, min: 5, max: 100, step: 5 },
    showAdvanced: { type: 'boolean', label: 'Show advanced connector settings', default: false },
  },
})
