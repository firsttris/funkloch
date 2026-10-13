import { createStartHandler, defaultStreamHandler } from '@tanstack/react-start/server'
import { paraglideMiddleware } from './paraglide/server.js'

const startHandler = createStartHandler(defaultStreamHandler)

export default {
  fetch(request: Request) {
    return paraglideMiddleware(request, () => startHandler(request))
  },
}
