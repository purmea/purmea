/**
 * Local stand-in for Vercel: serves dist/ with clean URLs and runs api/*.ts handlers.
 *   npm run build && npx tsx scripts/dev-server.mts   →  http://localhost:4321
 * Without KV_REST_API_* variables the API uses an in-memory store.
 */
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { extname, join } from 'node:path'

const routes: Record<string, Record<string, (r: Request) => Promise<Response>>> = {
  '/api/requests': await import('../api/requests.ts'),
  '/api/pay': await import('../api/pay.ts'),
  '/api/admin': await import('../api/admin.ts'),
} as never
const types: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' }

createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost:4321')
  const api = routes[url.pathname]
  if (api) {
    const chunks: Buffer[] = []
    for await (const c of req) chunks.push(c as Buffer)
    const handler = api[req.method ?? 'GET']
    if (!handler) { res.writeHead(405).end(); return }
    const r = await handler(new Request(url, { method: req.method, headers: req.headers as Record<string, string>, body: chunks.length ? Buffer.concat(chunks) : undefined }))
    res.writeHead(r.status, Object.fromEntries(r.headers)).end(Buffer.from(await r.arrayBuffer()))
    return
  }
  let path = url.pathname === '/' ? '/index.html' : url.pathname
  if (!extname(path)) path += '.html'
  try {
    const body = await readFile(join('dist', path))
    res.writeHead(200, { 'content-type': types[extname(path)] ?? 'application/octet-stream' }).end(body)
  } catch { res.writeHead(404).end('not found') }
}).listen(4321, () => console.log('http://localhost:4321'))
