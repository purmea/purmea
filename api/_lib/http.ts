import { randomBytes, timingSafeEqual } from 'node:crypto'

export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } })

export async function body<T>(request: Request): Promise<Partial<T>> {
  try { return (await request.json()) as Partial<T> } catch { return {} }
}

export const newToken = (bytes = 24) => randomBytes(bytes).toString('base64url')
export const newId = () => `${Date.now().toString(36)}${randomBytes(3).toString('hex')}`.toUpperCase().slice(-8)

/** ADMIN_TOKEN: a long random string (48+ chars) set as a Sensitive env var on Vercel. */
export function isAdmin(request: Request) {
  const expected = process.env.ADMIN_TOKEN
  const given = (request.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '')
  if (!expected || expected.length < 24 || !given) return false
  const a = Buffer.from(expected), b = Buffer.from(given)
  return a.length === b.length && timingSafeEqual(a, b)
}

export const clientIp = (request: Request) => (request.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || 'local'
export const siteOrigin = (request: Request) => process.env.SITE_URL?.replace(/\/$/, '') ?? new URL(request.url).origin

// eslint-disable-next-line no-control-regex -- strip NUL bytes from user input
export const clean = (v: unknown, max: number) => String(v ?? '').replace(/\u0000/g, '').trim().slice(0, max)
export const euros = (cents: number) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: cents % 100 ? 2 : 0 }).format(cents / 100)
