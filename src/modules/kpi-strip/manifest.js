import { Gauge } from 'lucide-react'
import { defineModule } from '@core'

export default defineModule({
  id: 'kpi-strip',
  name: 'Portfolio Pulse',
  description: 'Headline portfolio metrics above every view',
  slot: 'header',
  icon: Gauge,
  order: 0,
  options: {
    showDanger: { type: 'boolean', label: 'Show renewal-danger tile', default: true },
  },
})
