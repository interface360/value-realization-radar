import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto'
import { chmodSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

// Connection credentials are encrypted at rest with AES-256-GCM. The key comes
// from VRR_SECRET_KEY (base64, 32 bytes) or is generated once into the data dir.
let KEY = null

export function initSecretKey(dataDir) {
  const fromEnv = process.env.VRR_SECRET_KEY
  if (fromEnv) {
    KEY = Buffer.from(fromEnv, 'base64')
    if (KEY.length !== 32) throw new Error('VRR_SECRET_KEY must be 32 bytes, base64-encoded')
    return
  }
  const file = join(dataDir, 'secret.key')
  if (!existsSync(file)) {
    writeFileSync(file, randomBytes(32).toString('base64'))
    chmodSync(file, 0o600)
  }
  KEY = Buffer.from(readFileSync(file, 'utf8').trim(), 'base64')
}

export function encrypt(value) {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', KEY, iv)
  const data = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()])
  return ['v1', iv.toString('base64'), cipher.getAuthTag().toString('base64'), data.toString('base64')].join('.')
}

export function decrypt(payload) {
  const [version, iv, tag, data] = payload.split('.')
  if (version !== 'v1') throw new Error('Unsupported secret format')
  const decipher = createDecipheriv('aes-256-gcm', KEY, Buffer.from(iv, 'base64'))
  decipher.setAuthTag(Buffer.from(tag, 'base64'))
  return JSON.parse(Buffer.concat([decipher.update(Buffer.from(data, 'base64')), decipher.final()]).toString('utf8'))
}

export const sha256 = (s) => createHash('sha256').update(s).digest('hex')

export function safeEqual(a, b) {
  const x = Buffer.from(a)
  const y = Buffer.from(b)
  return x.length === y.length && timingSafeEqual(x, y)
}

export const newId = (prefix) => `${prefix}_${randomUUID().replace(/-/g, '').slice(0, 20)}`

// API keys look like `vrr_<tenantId>.<secret>` so the tenant can be resolved
// without a lookup by secret; only the hash of the secret is stored.
export function newApiKey(tenantId) {
  const secret = randomBytes(24).toString('base64url')
  return { key: `vrr_${tenantId}.${secret}`, hash: sha256(secret) }
}

export function parseApiKey(key) {
  const m = /^vrr_([a-z0-9_-]+)\.([A-Za-z0-9_-]+)$/.exec(key ?? '')
  return m ? { tenantId: m[1], secret: m[2] } : null
}
