import * as d3 from 'd3'
import { useId } from 'react'

export function Sparkline({ values, color = '#22d3ee', width = 160, height = 40, showEnd = true, className }) {
  const gradientId = useId()
  if (!values?.length) return null

  const x = d3.scaleLinear([0, values.length - 1], [2, width - 4])
  const y = d3.scaleLinear([0, d3.max(values) || 1], [height - 2, 4])
  const line = d3.line((_, i) => x(i), y).curve(d3.curveMonotoneX)
  const area = d3.area((_, i) => x(i), height, y).curve(d3.curveMonotoneX)
  const last = values.length - 1

  return (
    <svg width={width} height={height} className={className} aria-hidden="true">
      <defs>
        <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.25" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area(values)} fill={`url(#${gradientId})`} />
      <path d={line(values)} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" style={{ filter: `drop-shadow(0 0 4px ${color})` }} />
      {showEnd && <circle cx={x(last)} cy={y(values[last])} r="3" fill={color} />}
    </svg>
  )
}
