import { createFileRoute } from '@tanstack/react-router'
import { liveResponse } from '~/server/live'
import { getRuntime } from '~/server/runtime'

export const Route = createFileRoute('/api/live')({
  server: {
    handlers: {
      GET: ({ request }) => liveResponse(getRuntime().live, request.signal),
    },
  },
})
