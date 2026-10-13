// Production entry: serves the built client assets and hands everything else to the Start handler.
// The handler's module starts the adapters and jobs (src/server.ts), so this file stays a thin shell.
import { join, normalize } from 'node:path'

const clientDir = join(import.meta.dir, 'dist/client')
const { default: app } = (await import(join(import.meta.dir, 'dist/server/server.js'))) as {
  default: {
    fetch: (request: Request) => Response | Promise<Response>
    stop: () => Promise<void>
  }
}

/** The path as text; null for a broken escape like "%E0", which is then no file */
const decodePath = (pathname: string) => {
  try {
    return decodeURIComponent(pathname)
  } catch {
    return null
  }
}

const staticFile = async (pathname: string) => {
  const decoded = decodePath(pathname)
  if (decoded === null) return null
  const path = normalize(join(clientDir, decoded))
  if (!path.startsWith(clientDir) || pathname === '/') return null
  const file = Bun.file(path)
  return (await file.exists()) ? file : null
}

const port = Number(process.env.PORT ?? 8090)

const server = Bun.serve({
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

/** A stop that hangs (an unreachable broker, say) still ends the process before the KILL */
const SHUTDOWN_LIMIT = 5000

let stopping = false

/**
 * As PID 1 in a container the process ignores SIGTERM unless it handles it, and the runtime then
 * kills it after its grace period. Closing in order keeps the last write in the database.
 */
const shutdown = async (signal: string) => {
  if (stopping) return
  stopping = true
  console.log(`${signal}: shutting down`)
  setTimeout(() => process.exit(1), SHUTDOWN_LIMIT).unref()
  try {
    // true closes the open connections too; the live stream never ends on its own
    await server.stop(true)
    await app.stop()
    process.exit(0)
  } catch (error) {
    console.error('shutdown failed', error)
    process.exit(1)
  }
}

process.on('SIGTERM', () => void shutdown('SIGTERM'))
process.on('SIGINT', () => void shutdown('SIGINT'))
