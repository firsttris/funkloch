import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { getRuntime } from '~/server/runtime'
import { eventsCsv } from '~/server/views/events'

const querySchema = z.object({
  kind: z.enum(['all', 'offline', 'signal', 'topology', 'network']).catch('all'),
  days: z.coerce
    .number()
    .pipe(z.union([z.literal(7), z.literal(30), z.literal(90)]))
    .catch(30),
})

export const Route = createFileRoute('/api/events.csv')({
  server: {
    handlers: {
      GET: ({ request }) => {
        const query = querySchema.parse(Object.fromEntries(new URL(request.url).searchParams))
        const csv = eventsCsv(getRuntime().viewContext(), query.kind, query.days)
        return new Response(csv, {
          headers: {
            'content-type': 'text/csv; charset=utf-8',
            'content-disposition': `attachment; filename="funkloch-events-${query.days}d.csv"`,
          },
        })
      },
    },
  },
})
