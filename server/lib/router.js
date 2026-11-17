// Minimal JSON router on node:http — keeps the server dependency-free.

export class ApiError extends Error {
  constructor(status, message, details) {
    super(message)
    this.status = status
    this.details = details
  }
}

export function createRouter() {
  const routes = []
  const add = (method) => (pattern, ...handlers) => {
    const keys = []
    const regex = new RegExp(`^${pattern.replace(/:(\w+)/g, (_, k) => (keys.push(k), '([^/]+)'))}/?$`)
    routes.push({ method, regex, keys, handlers })
  }

  async function handle(req, res, ctx) {
    const url = new URL(req.url, 'http://localhost')
    const match = routes.find((r) => r.method === req.method && r.regex.test(url.pathname))
    if (!match) {
      const exists = routes.some((r) => r.regex.test(url.pathname))
      throw new ApiError(exists ? 405 : 404, exists ? 'Method not allowed' : `No route for ${req.method} ${url.pathname}`)
    }
    const values = match.regex.exec(url.pathname).slice(1).map(decodeURIComponent)
    const request = {
      raw: req,
      method: req.method,
      path: url.pathname,
      params: Object.fromEntries(match.keys.map((k, i) => [k, values[i]])),
      query: Object.fromEntries(url.searchParams),
      headers: req.headers,
      body: undefined,
      ...ctx,
    }
    if (!['GET', 'HEAD', 'DELETE'].includes(req.method)) request.body = await readBody(req)
    let result
    for (const h of match.handlers) {
      result = await h(request, res)
      if (res.writableEnded) return
    }
    send(res, result === undefined ? 204 : 200, result)
  }

  return { get: add('GET'), post: add('POST'), put: add('PUT'), patch: add('PATCH'), delete: add('DELETE'), handle }
}

const MAX_BODY = 12 * 1024 * 1024

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    req.on('data', (c) => {
      size += c.length
      if (size > MAX_BODY) {
        reject(new ApiError(413, 'Request body too large (max 12 MB)'))
        req.destroy()
      } else chunks.push(c)
    })
    req.on('end', () => {
      const text = Buffer.concat(chunks).toString('utf8')
      if (!text) return resolve(undefined)
      const type = req.headers['content-type'] ?? ''
      if (type.includes('application/json')) {
        try {
          resolve(JSON.parse(text))
        } catch {
          reject(new ApiError(400, 'Invalid JSON body'))
        }
      } else resolve(text)
    })
    req.on('error', reject)
  })
}

export function send(res, status, payload) {
  if (res.writableEnded) return
  if (status === 204) {
    res.writeHead(204).end()
    return
  }
  const body = JSON.stringify(payload)
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' })
  res.end(body)
}
