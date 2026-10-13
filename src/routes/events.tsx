import { queryOptions, useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute, Link, stripSearchParams, useNavigate } from '@tanstack/react-router'
import { Download } from 'lucide-react'
import type { ReactNode } from 'react'
import { z } from 'zod'
import { AppHeader } from '~/components/app-header'
import { eventDetail, eventTitle, KIND_TONE, kindLabel } from '~/components/labels'
import { NotificationSettings, settingsQuery } from '~/components/notification-settings'
import { Card, CardHeader, CardTitle } from '~/components/ui/card'
import { ChipFilter } from '~/components/ui/chip-filter'
import { Segmented } from '~/components/ui/segmented'
import { cn } from '~/lib/cn'
import { m } from '~/paraglide/messages.js'
import { getLocale } from '~/paraglide/runtime.js'
import { getEvents } from '~/server/fn/pages'
import type { EventsView } from '~/server/views/events'

const KINDS = ['all', 'offline', 'signal', 'topology', 'network'] as const

const searchSchema = z.object({
  kind: z.enum(KINDS).catch('all').default('all'),
  days: z
    .union([z.literal(7), z.literal(30), z.literal(90)])
    .catch(30)
    .default(30),
})

type Search = z.infer<typeof searchSchema>

const eventsQuery = (search: Search) =>
  queryOptions({
    queryKey: ['events', search.kind, search.days],
    queryFn: () => getEvents({ data: search }),
    refetchInterval: 30_000,
  })

export const Route = createFileRoute('/events')({
  validateSearch: searchSchema,
  search: { middlewares: [stripSearchParams({ kind: 'all', days: 30 })] },
  loaderDeps: ({ search }) => search,
  loader: async ({ context, deps }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(eventsQuery(deps)),
      context.queryClient.ensureQueryData(settingsQuery),
    ])
  },
  head: () => ({ meta: [{ title: `${m.events_page_title()} · Funkloch` }] }),
  component: EventsPage,
})

type Event = EventsView['events'][number]

const KIND_COUNT: Record<(typeof KINDS)[number], (inputs: { count: number }) => string> = {
  all: m.events_kind_all,
  offline: m.events_kind_offline,
  signal: m.events_kind_signal,
  topology: m.events_kind_topology,
  network: m.events_kind_network,
}

/** Events by local day, newest day first: "Heute · Di 13.10." */
const byDay = (events: Event[], now: number) => {
  const format = new Intl.DateTimeFormat(getLocale(), {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
  })
  const today = new Date(now).toDateString()
  const groups = new Map<string, { label: string; items: Event[] }>()
  for (const event of events) {
    const date = new Date(event.ts)
    const key = date.toDateString()
    const label =
      key === today ? m.events_today({ date: format.format(date) }) : format.format(date)
    const group = groups.get(key) ?? { label, items: [] }
    group.items.push(event)
    groups.set(key, group)
  }
  return [...groups.values()]
}

const time = (ts: number) =>
  new Intl.DateTimeFormat(getLocale(), { hour: '2-digit', minute: '2-digit' }).format(ts)

function EventsPage() {
  const search = Route.useSearch()
  const navigate = useNavigate({ from: '/events' })
  const { data } = useSuspenseQuery(eventsQuery(search))
  const labels = new Map(data.protocols.map((p) => [p.id, p.label]))
  const days = byDay(data.events, data.now)

  return (
    <div className="min-h-screen">
      <AppHeader adapters={data.adapters} />
      <main className="mx-auto flex max-w-[1360px] flex-col gap-5 px-4 pt-7 pb-12 sm:px-8">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="m-0 text-[26px] font-bold tracking-tight">{m.events_page_title()}</h1>
            <p className="mt-1 text-foreground-subtle">{m.events_page_subtitle()}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Segmented
              label={m.events_range()}
              value={String(search.days) as '7' | '30' | '90'}
              options={[
                { value: '7', label: m.range_7d() },
                { value: '30', label: m.range_30d() },
                { value: '90', label: m.range_90d() },
              ]}
              onChange={(value) =>
                navigate({ search: (prev) => ({ ...prev, days: Number(value) as Search['days'] }) })
              }
            />
            <a
              href={`/api/events.csv?kind=${search.kind}&days=${search.days}`}
              download
              className="inline-flex min-h-10 items-center gap-2 rounded-md border border-border bg-surface px-3.5 font-medium text-foreground no-underline hover:bg-track"
            >
              <Download aria-hidden="true" className="size-4" />
              {m.events_export()}
            </a>
          </div>
        </div>

        <div className="flex flex-wrap items-start gap-4">
          <Card className="min-w-0 flex-[999_1_640px]">
            <CardHeader>
              <CardTitle>{m.events_log()}</CardTitle>
              <ChipFilter
                label={m.events_filter_label()}
                value={search.kind}
                options={KINDS.map((kind) => ({
                  value: kind,
                  label: KIND_COUNT[kind]({ count: data.counts[kind] }),
                }))}
                onChange={(kind) => navigate({ search: (prev) => ({ ...prev, kind }) })}
              />
            </CardHeader>
            {days.length === 0 ? (
              <p className="px-[18px] py-10 text-center text-foreground-subtle">
                {m.events_empty()}
              </p>
            ) : (
              days.map((day) => (
                <section key={day.label}>
                  <h3 className="m-0 border-b border-border-subtle bg-surface-muted px-[18px] py-2.5 text-xs font-semibold text-foreground-muted">
                    {day.label}
                  </h3>
                  <ol className="m-0 list-none p-0">
                    {day.items.map((event) => (
                      <li
                        key={event.id}
                        data-testid="event"
                        className="grid grid-cols-[52px_112px_minmax(0,1fr)] items-start gap-x-3.5 gap-y-1 border-b border-border-subtle px-[18px] py-3"
                      >
                        <span className="pt-0.5 font-mono text-xs text-foreground-subtle">
                          {time(event.ts)}
                        </span>
                        <span>
                          <span
                            className={cn(
                              'inline-block rounded-full px-2 py-0.5 text-xs font-semibold',
                              KIND_TONE[event.kind],
                            )}
                          >
                            {kindLabel(event.kind)}
                          </span>
                        </span>
                        <EventText
                          event={event}
                          protocolLabel={event.protocol ? labels.get(event.protocol) : undefined}
                        />
                      </li>
                    ))}
                  </ol>
                </section>
              ))
            )}
            {data.truncated ? (
              <p role="status" className="m-0 px-[18px] pt-3 text-[13px] text-foreground-muted">
                {m.events_truncated({
                  shown: data.events.length,
                  total: data.counts[data.kind],
                })}
              </p>
            ) : null}
            <div className="px-[18px] py-3 text-xs text-foreground-subtle">{m.events_footer()}</div>
          </Card>
          <aside className="flex min-w-0 flex-[1_1_320px] flex-col gap-4">
            <NotificationSettings />
          </aside>
        </div>
      </main>
    </div>
  )
}

const EventText = ({
  event,
  protocolLabel,
}: {
  event: Event
  protocolLabel?: string
}): ReactNode => {
  const detail = eventDetail(event)
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold">{eventTitle(event)}</span>
        {event.deviceId !== null && event.device ? (
          <Link to="/devices/$id" params={{ id: event.deviceId }} className="text-foreground-muted">
            {event.device}
          </Link>
        ) : protocolLabel ? (
          <span className="text-foreground-muted">{protocolLabel}</span>
        ) : null}
        {protocolLabel ? (
          <span
            className={cn(
              'rounded px-1.5 text-[10px] font-bold',
              event.protocol === 'zigbee' ? 'bg-zigbee-bg text-zigbee' : 'bg-thread-bg text-thread',
            )}
          >
            {protocolLabel === 'Zigbee' ? 'ZB' : protocolLabel === 'Thread' ? 'TH' : protocolLabel}
          </span>
        ) : null}
      </div>
      {detail ? <span className="text-[13px] text-foreground-muted">{detail}</span> : null}
    </div>
  )
}
