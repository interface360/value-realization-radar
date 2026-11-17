export function money(value, { precise = false } = {}) {
  const abs = Math.abs(value)
  const sign = value < 0 ? '-' : ''
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(precise ? 2 : 1)}M`
  if (abs >= 1_000) return `${sign}$${Math.round(abs / 1_000)}k`
  return `${sign}$${Math.round(abs)}`
}

export const pct = (ratio, digits = 0) => `${(ratio * 100).toFixed(digits)}%`

export const num = (value) => Math.round(value).toLocaleString('en-US')

export function days(n) {
  if (n < 0) return `${Math.abs(n)}d overdue`
  if (n === 0) return 'today'
  return `${n}d`
}

export function relativeTime(iso, now = Date.now()) {
  const diff = Math.round((now - new Date(iso).getTime()) / 60_000)
  if (diff < 1) return 'just now'
  if (diff < 60) return `${diff}m ago`
  if (diff < 1440) return `${Math.round(diff / 60)}h ago`
  return `${Math.round(diff / 1440)}d ago`
}
