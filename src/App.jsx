import { DataProvider } from '@core/data/DataProvider.jsx'
import { ModuleProvider } from '@core/modules/index.js'
import { AppShell } from '@core/shell/AppShell.jsx'
import { registry } from './modules/index.js'

export default function App() {
  return (
    <DataProvider>
      <ModuleProvider registry={registry}>
        <AppShell />
      </ModuleProvider>
    </DataProvider>
  )
}
