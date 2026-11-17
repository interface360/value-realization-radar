import { useCallback, useEffect, useState } from 'react'
import { useDataContext } from '@core'

// The active workspace's API client (null in local-demo mode).
export function useApi() {
  const { provider } = useDataContext()
  return provider.kind === 'server' ? provider.api : null
}

export function useRefreshPortfolio() {
  const { provider } = useDataContext()
  return provider.refresh
}

// Minimal async resource hook: { data, error, loading, reload }.
export function useResource(fn, deps) {
  const [state, setState] = useState({ data: null, error: null, loading: true })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const load = useCallback(fn, deps)
  const reload = useCallback(() => {
    setState((s) => ({ ...s, loading: true }))
    return load()
      .then((data) => setState({ data, error: null, loading: false }))
      .catch((error) => setState((s) => ({ data: s.data, error, loading: false })))
  }, [load])
  useEffect(() => {
    reload()
  }, [reload])
  return { ...state, reload, setData: (data) => setState((s) => ({ ...s, data })) }
}
