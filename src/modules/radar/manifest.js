import { Radar } from 'lucide-react'
import { defineModule } from '@core'

export default defineModule({
  id: 'radar',
  name: 'Radar',
  description: 'Renewal proximity × value realization, sized by ARR',
  slot: 'tab',
  icon: Radar,
  order: 10,
  options: {
    horizonDays: { type: 'number', label: 'Renewal horizon', default: 365, min: 90, max: 540, step: 15, unit: 'd' },
    maxBubble: { type: 'number', label: 'Max bubble radius', default: 44, min: 20, max: 70, unit: 'px' },
    labelTop: { type: 'number', label: 'Direct-label top N by ARR', default: 5, min: 0, max: 12 },
    showDangerZone: { type: 'boolean', label: 'Highlight renewal-danger zone', default: true },
    showQuadrants: { type: 'boolean', label: 'Quadrant captions', default: true },
  },
})
