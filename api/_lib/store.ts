import type { Commission } from './types.js'

/**
 * Storage: Upstash Redis over its REST API (free tier; add it from Vercel → Storage → Upstash for Redis,
 * which sets KV_REST_API_URL / KV_REST_API_TOKEN). Without those variables a memory store is used:
 * fine for local tests, NOT for production (data would vanish between requests).
 */
const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL
const token = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN

/** True when requests can be saved durably (or we're not in production). */
export const storageReady = () => !!(url && token) || process.env.VERCEL_ENV !== 'production'

const mem = new Map<string, string>()
const memZ: { score: number; member: string }[] = []

async function redis<T = unknown>(...cmd: (string | number)[]): Promise<T> {
  if (!url || !token) return memory(cmd) as T
  const res = await fetch(url, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify(cmd) })
  const body = (await res.json()) as { result?: T; error?: string }
  if (!res.ok || body.error) throw new Error(`redis: ${body.error ?? res.status}`)
  return body.result as T
}

function memory(cmd: (string | number)[]): unknown {
  if (process.env.VERCEL_ENV === 'production') throw new Error('Storage is not configured: add Upstash for Redis to the project.')
  const [op, k, ...a] = cmd.map(String)
  switch (op) {
    case 'GET': return mem.get(k) ?? null
    case 'SET': mem.set(k, a[0]); return 'OK'
    case 'INCR': { const v = Number(mem.get(k) ?? 0) + 1; mem.set(k, String(v)); return v }
    case 'EXPIRE': return 1
    case 'ZADD': memZ.push({ score: Number(a[0]), member: a[1] }); return 1
    case 'ZREVRANGE': return [...memZ].sort((x, y) => y.score - x.score).slice(Number(a[0]), Number(a[1]) + 1).map((x) => x.member)
    default: throw new Error(`memory store: ${op} not supported`)
  }
}

export async function save(c: Commission) {
  c.updatedAt = Date.now()
  await redis('SET', `commission:${c.id}`, JSON.stringify(c))
}
export async function create(c: Commission) {
  await save(c)
  await redis('SET', `token:${c.token}`, c.id)
  await redis('ZADD', 'commissions', c.createdAt, c.id)
}
export async function get(id: string): Promise<Commission | null> {
  const raw = await redis<string | null>('GET', `commission:${id}`)
  return raw ? (JSON.parse(raw) as Commission) : null
}
export async function byToken(token: string) {
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return null
  const id = await redis<string | null>('GET', `token:${token}`)
  return id ? get(id) : null
}
export async function list(limit = 200) {
  const ids = await redis<string[]>('ZREVRANGE', 'commissions', 0, limit - 1)
  const all = await Promise.all(ids.map(get))
  return all.filter((c): c is Commission => !!c)
}
/** Simple fixed-window limit: `max` hits per `seconds` for one key. */
export async function allow(key: string, max: number, seconds: number) {
  const n = await redis<number>('INCR', `rate:${key}`)
  if (n === 1) await redis('EXPIRE', `rate:${key}`, seconds)
  return n <= max
}
export async function cached<T>(key: string, seconds: number, load: () => Promise<T>): Promise<T> {
  const hit = await redis<string | null>('GET', `cache:${key}`)
  if (hit) return JSON.parse(hit) as T
  const v = await load()
  await redis('SET', `cache:${key}`, JSON.stringify(v), 'EX', seconds)
  return v
}
