import { createStartHandler, defaultStreamHandler } from '@tanstack/react-start/server'
import { paraglideMiddleware } from './paraglide/server.js'
import { handleAuth } from './server/auth'
import { getRuntime } from './server/runtime'

// Adapters, ingest and jobs start with the server, not with the first request
const runtime = getRuntime()

const startHandler = createStartHandler(defaultStreamHandler)

export default {
  async fetch(request: Request) {
    // Every request passes the login check first; the demo needs no login
    const answer = await handleAuth(request, {
      db: runtime.db,
      enabled: !runtime.config.FUNKLOCH_DEMO,
      dev: import.meta.env.DEV,
    })
    if (answer) return answer
    return paraglideMiddleware(request, () => startHandler(request))
  },
}
