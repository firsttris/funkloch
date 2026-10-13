import { createFileRoute } from '@tanstack/react-router'
import { health } from '~/server/api'

export const Route = createFileRoute('/healthz')({
  server: {
    handlers: {
      GET: () => {
        const result = health()
        return Response.json(result, { status: result.ok ? 200 : 503 })
      },
    },
  },
})
