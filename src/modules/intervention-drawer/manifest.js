import { PanelRight } from 'lucide-react'
import { defineModule } from '@core'

export default defineModule({
  id: 'intervention-drawer',
  name: 'Intervention Drawer',
  description: 'Slide-out action panel for any clicked account',
  slot: 'overlay',
  icon: PanelRight,
  options: {
    showActivity: { type: 'boolean', label: 'Show activity log', default: true },
    closeOnAction: { type: 'boolean', label: 'Close after executing a strategy', default: false },
  },
})
