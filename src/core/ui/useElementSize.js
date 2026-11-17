import { useCallback, useEffect, useRef, useState } from 'react'

// Callback ref so measuring starts whenever the element mounts — including
// elements rendered after a loading state.
export function useElementSize() {
  const [size, setSize] = useState({ width: 0, height: 0 })
  const observer = useRef(null)

  const ref = useCallback((el) => {
    observer.current?.disconnect()
    observer.current = null
    if (!el) return
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect
      setSize((s) => (s.width === width && s.height === height ? s : { width, height }))
    })
    ro.observe(el)
    observer.current = ro
  }, [])

  useEffect(() => () => observer.current?.disconnect(), [])

  return [ref, size]
}
