// Production entry: serves the built client assets and hands everything else to the Start handler.
// The handler's module starts the adapters and jobs (src/server.ts), so this file stays a thin shell.
import { join, normalize } from 'node:path'

const clientDir = join(import.meta.dir, 'dist/client')
const { default: app } = (await import(join(import.meta.dir, 'dist/server/server.js'))) as {
  default: { fetch: (request: Request) => Response | Promise<Response> }
}

const staticFile = async (pathname: string) => {
  const path = normalize(join(clientDir, decodeURIComponent(pathname)))
  if (!path.startsWith(clientDir) || pathname === '/') return null
  const file = Bun.file(path)
  return (await file.exists()) ? file : null
}

const port = Number(process.env.PORT ?? 8090)

Bun.serve({
  port,
  idleTimeout: 0, // the SSE stream stays open
  async fetch(request) {
    const { pathname } = new URL(request.url)
    const file = await staticFile(pathname)
    if (file) {
      const immutable = pathname.startsWith('/assets/')
      return new Response(file, {
        headers: immutable ? { 'cache-control': 'public, max-age=31536000, immutable' } : {},
      })
    }
    return app.fetch(request)
  },
})

console.log(`Funkloch listening on http://localhost:${port}`)
