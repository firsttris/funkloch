import { createStartHandler, defaultStreamHandler } from '@tanstack/react-start/server'
import { paraglideMiddleware } from './paraglide/server.js'
import { getRuntime } from './server/runtime'

// Adapters, ingest and jobs start with the server, not with the first request
getRuntime()

const startHandler = createStartHandler(defaultStreamHandler)

export default {
  fetch(request: Request) {
    return paraglideMiddleware(request, () => startHandler(request))
  },
}
