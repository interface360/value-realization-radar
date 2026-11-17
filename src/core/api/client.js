// Thin client for the VRR sync server. One instance per workspace (tenant).

export class ApiError extends Error {
  constructor(message, status, body) {
    super(message)
    this.status = status
    this.body = body
  }
}

export function createApiClient({ serverUrl, apiKey }) {
  const base = String(serverUrl).replace(/\/+$/, '')

  async function call(method, path, body) {
    let res
    try {
      res = await fetch(`${base}/api${path}`, {
        method,
        headers: { authorization: `Bearer ${apiKey}`, ...(body !== undefined ? { 'content-type': 'application/json' } : {}) },
        body: body !== undefined ? JSON.stringify(body) : undefined,
      })
    } catch {
      throw new ApiError(`Can't reach the sync server at ${base}. Is it running? (npm run server)`, 0)
    }
    if (res.status === 204) return null
    const data = await res.json().catch(() => null)
    if (!res.ok) throw new ApiError(data?.error ?? `${res.status} ${res.statusText}`, res.status, data)
    return data
  }

  const enc = encodeURIComponent
  return {
    serverUrl: base,
    me: () => call('GET', '/me'),
    connectors: () => call('GET', '/connectors'),
    schema: () => call('GET', '/schema'),
    connections: {
      list: () => call('GET', '/connections'),
      get: (id) => call('GET', `/connections/${enc(id)}`),
      create: (body) => call('POST', '/connections', body),
      update: (id, patch) => call('PATCH', `/connections/${enc(id)}`, patch),
      remove: (id, { keepData = false } = {}) => call('DELETE', `/connections/${enc(id)}${keepData ? '?keepData=true' : ''}`),
      test: (id) => call('POST', `/connections/${enc(id)}/test`),
      streams: (id) => call('GET', `/connections/${enc(id)}/streams`),
      sample: (id, stream, limit = 25) => call('GET', `/connections/${enc(id)}/streams/${enc(stream)}/sample?limit=${limit}`),
      suggest: (id, entity, stream) => call('POST', `/connections/${enc(id)}/suggest`, { entity, stream }),
      preview: (id, entity, mapping) => call('POST', `/connections/${enc(id)}/preview`, { entity, mapping }),
      upload: (id, filename, content) => call('POST', `/connections/${enc(id)}/upload`, { filename, content }),
      sync: (id, opts = {}) => call('POST', `/connections/${enc(id)}/sync`, opts),
      runs: (id) => call('GET', `/connections/${enc(id)}/runs`),
    },
    portfolio: {
      snapshot: () => call('GET', '/portfolio'),
      activity: (accountId, limit = 6) => call('GET', `/portfolio/activity/${enc(accountId)}?limit=${limit}`),
      startIntervention: (account_id, type, details) => call('POST', '/portfolio/interventions', { account_id, type, details }),
      resolveIntervention: (id) => call('POST', `/portfolio/interventions/${enc(id)}/resolve`),
      setBlocker: (projectId, blocker_type) => call('POST', `/portfolio/projects/${enc(projectId)}/blocker`, { blocker_type }),
      resetAppData: () => call('POST', '/portfolio/reset-app-data'),
    },
  }
}

// Unauthenticated probe used by the "connect workspace" form.
export async function verifyWorkspace(serverUrl, apiKey) {
  const client = createApiClient({ serverUrl, apiKey })
  const { tenant } = await client.me()
  return tenant
}
