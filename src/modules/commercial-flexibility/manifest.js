import { Scale } from 'lucide-react'
import { defineModule, THRESHOLDS } from '@core'

export default defineModule({
  id: 'commercial-flexibility',
  name: 'Commercial Flexibility',
  description: 'AE safety net: model flexible packaging for at-risk renewals',
  slot: 'tab',
  icon: Scale,
  order: 40,
  options: {
    windowDays: { type: 'number', label: 'Renewal within', default: THRESHOLDS.renewalWindowDays, min: 30, max: 180, step: 15, unit: 'd' },
    maxRealization: { type: 'number', label: 'Realization below', default: THRESHOLDS.lowRealization * 100, min: 10, max: 80, step: 5, unit: '%' },
    targetRealization: { type: 'number', label: 'Healthy-renewal target', default: 60, min: 30, max: 100, step: 5, unit: '%' },
    maxExtensionMonths: { type: 'number', label: 'Max term extension', default: 12, min: 3, max: 24, unit: 'mo' },
  },
})
