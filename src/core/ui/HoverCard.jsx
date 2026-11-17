import { useLayoutEffect, useRef, useState } from 'react'

// Tooltip positioned relative to a container. Flips to stay inside bounds.
export function HoverCard({ x, y, bounds, children }) {
  const ref = useRef(null)
  const [box, setBox] = useState({ w: 0, h: 0 })

  // Re-measure when the anchor or content changes; the equality guard prevents loops.
  useLayoutEffect(() => {
    if (!ref.current) return
    const { offsetWidth: w, offsetHeight: h } = ref.current
    setBox((b) => (b.w === w && b.h === h ? b : { w, h }))
  }, [x, y, children])

  const gap = 14
  let left = x + gap
  let top = y - box.h / 2
  if (bounds && left + box.w > bounds.width) left = x - gap - box.w
  if (bounds) top = Math.max(4, Math.min(bounds.height - box.h - 4, top))

  return (
    <div
      ref={ref}
      role="tooltip"
      className="pointer-events-none absolute z-20 w-64 rounded-xl bg-slate-950/90 p-3 text-xs shadow-2xl ring-1 shadow-black/60 ring-white/10 backdrop-blur-md"
      style={{ left, top }}
    >
      {children}
    </div>
  )
}

export function HoverRow({ label, value, tone }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-0.5">
      <span className="text-slate-400">{label}</span>
      <span className="font-mono text-slate-100 tabular-nums" style={tone ? { color: tone } : undefined}>
        {value}
      </span>
    </div>
  )
}
