import { BookOpen } from 'lucide-react'
import { defineModule } from '@core'

export default defineModule({
  id: 'docs',
  name: 'Docs',
  description: 'Product documentation with search, bundled from docs/*.md',
  slot: 'tab',
  icon: BookOpen,
  order: 95,
  options: {
    showSearch: { type: 'boolean', label: 'Show search', default: true },
  },
})
