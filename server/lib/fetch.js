import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'

// Outbound HTTP for connectors. Tenants supply arbitrary URLs, so requests to
// private/loopback networks are blocked unless explicitly allowed (SSRF guard).

export class HttpError extends Error {
  constructor(message, { status, body, url } = {}) {
    super(message)
    this.status = status
    this.body = body
    this.url = url
  }
}

const allowPrivate = () => (process.env.VRR_ALLOW_PRIVATE_NETWORK ?? (process.env.NODE_ENV === 'production' ? 'false' : 'true')) === 'true'

function isPrivateAddress(ip) {
  if (isIP(ip) === 6) {
    const v = ip.toLowerCase()
    if (v === '::1' || v === '::') return true
    if (v.startsWith('fc') || v.startsWith('fd') || v.startsWith('fe80')) return true
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(v)
    return mapped ? isPrivateAddress(mapped[1]) : false
  }
  const [a, b] = ip.split('.').map(Number)
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127)
}

async function assertAllowed(url) {
  const u = new URL(url)
  if (!['http:', 'https:'].includes(u.protocol)) throw new HttpError(`Blocked protocol ${u.protocol}`, { url })
  if (allowPrivate()) return
  const host = u.hostname.replace(/^\[|\]$/g, '')
  const addresses = isIP(host) ? [{ address: host }] : await lookup(host, { all: true })
  if (addresses.some((a) => isPrivateAddress(a.address))) throw new HttpError(`Blocked request to private network host ${u.hostname}`, { url })
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/**
 * @param {string} url
 * @param {{ method?, headers?, query?, body?, form?, timeoutMs?, retries?, raw? }} opts
 */
export async function request(url, opts = {}) {
  const { method = 'GET', headers = {}, query, body, form, timeoutMs = 30_000, retries = 3, raw = false } = opts
  const u = new URL(url)
  for (const [k, v] of Object.entries(query ?? {})) {
    if (v === undefined || v === null) continue
    if (Array.isArray(v)) v.forEach((x) => u.searchParams.append(k, x))
    else u.searchParams.set(k, v)
  }
  await assertAllowed(u.toString())

  const init = { method, headers: { accept: 'application/json', ...headers }, redirect: 'manual' }
  if (form) {
    init.body = new URLSearchParams(form).toString()
    init.headers['content-type'] = 'application/x-www-form-urlencoded'
  } else if (body !== undefined) {
    init.body = typeof body === 'string' ? body : JSON.stringify(body)
    init.headers['content-type'] ??= 'application/json'
  }

  for (let attempt = 0; ; attempt++) {
    let res
    try {
      res = await fetch(u, { ...init, signal: AbortSignal.timeout(timeoutMs) })
    } catch (e) {
      if (attempt < retries) {
        await sleep(500 * 2 ** attempt)
        continue
      }
      throw new HttpError(`Network error calling ${u.host}: ${e.cause?.code ?? e.message}`, { url: u.toString() })
    }

    if ((res.status === 429 || res.status >= 500) && attempt < retries) {
      const retryAfter = Number(res.headers.get('retry-after'))
      await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(retryAfter, 30) * 1000 : 500 * 2 ** attempt)
      continue
    }
    if (res.status >= 300 && res.status < 400) {
      // Follow redirects manually so every hop passes the SSRF guard.
      const location = res.headers.get('location')
      if (!location || attempt >= retries) throw new HttpError(`Unexpected redirect from ${u.host}`, { status: res.status, url: u.toString() })
      return request(new URL(location, u).toString(), { ...opts, query: undefined, retries: retries - 1 })
    }

    const text = await res.text()
    if (!res.ok) {
      let detail = text.slice(0, 400)
      try {
        const j = JSON.parse(text)
        detail = j.message ?? j.error_description ?? j.error?.message ?? (Array.isArray(j) ? j[0]?.message : null) ?? j.error ?? detail
      } catch {
        // keep raw text
      }
      throw new HttpError(`${res.status} ${res.statusText} from ${u.host}: ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`, {
        status: res.status,
        body: text.slice(0, 2000),
        url: u.toString(),
      })
    }
    if (raw) return { text, headers: res.headers, status: res.status }
    if (!text) return { data: null, headers: res.headers, status: res.status }
    try {
      return { data: JSON.parse(text), headers: res.headers, status: res.status }
    } catch {
      throw new HttpError(`Expected JSON from ${u.host} but got: ${text.slice(0, 120)}`, { status: res.status, url: u.toString() })
    }
  }
}

// RFC 5988 Link header → { next: url, ... }
export function parseLinkHeader(header) {
  const out = {}
  for (const part of (header ?? '').split(',')) {
    const m = /<([^>]+)>\s*;\s*rel="?([^";]+)"?/.exec(part.trim())
    if (m) out[m[2]] = m[1]
  }
  return out
}
