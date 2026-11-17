import { Component } from 'react'
import { TriangleAlert } from 'lucide-react'

// Keeps a failing module from taking down the rest of the app.
export class ModuleErrorBoundary extends Component {
  state = { error: null }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    console.error(`[modules] ${this.props.module.id}@${this.props.module.version} crashed`, error, info.componentStack)
  }

  render() {
    if (!this.state.error) return this.props.children
    const { module } = this.props
    return (
      <div className="m-4 flex items-start gap-3 rounded-xl bg-rose-500/10 p-4 text-sm text-rose-200 ring-1 ring-rose-500/30">
        <TriangleAlert className="mt-0.5 size-4 shrink-0 text-rose-400" />
        <div className="min-w-0">
          <p className="font-medium">
            {module.name} <span className="font-mono text-xs text-rose-300/70">v{module.version}</span> failed to render
          </p>
          <p className="mt-1 truncate font-mono text-xs text-rose-300/70">{String(this.state.error.message ?? this.state.error)}</p>
          <button
            type="button"
            onClick={() => this.setState({ error: null })}
            className="mt-3 rounded-md bg-rose-500/20 px-2.5 py-1 text-xs font-medium hover:bg-rose-500/30"
          >
            Retry
          </button>
        </div>
      </div>
    )
  }
}
