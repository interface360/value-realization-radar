import { Sparkles } from 'lucide-react'
import { defineModule } from '@core'

export default defineModule({
  id: 'assistant',
  name: 'AI Assistant',
  description: 'Ask about the docs or your live portfolio — Gemini, OpenAI or your own LLM',
  slot: 'overlay',
  icon: Sparkles,
  options: {
    allowProviderSwitch: { type: 'boolean', label: 'Let users switch LLM provider/model', default: true },
    suggestions: { type: 'boolean', label: 'Show suggested questions', default: true },
    useDataTools: { type: 'boolean', label: 'Let the assistant read portfolio data', default: true, help: 'Off = answers from documentation only; no portfolio data is sent to the LLM.' },
  },
})
