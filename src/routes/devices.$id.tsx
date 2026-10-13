import { queryOptions, useSuspenseQuery } from '@tanstack/react-query'
import {
  ClientOnly,
  createFileRoute,
  Link,
  stripSearchParams,
  useNavigate,
} from '@tanstack/react-router'
import { ChevronLeft } from 'lucide-react'
import type { ReactNode } from 'react'
import { z } from 'zod'
import { AppHeader } from '~/components/app-header'
import { KpiCard } from '~/components/kpi-card'
import {
  eventColor,
  eventDetail,
  eventTitle,
  powerLabel,
  roleLabel,
  statusLabel,
  trendLabel,
} from '~/components/labels'
import { MessagesChart } from '~/components/messages-chart'
import { NotFound } from '~/components/not-found'
import { ProtocolBadge } from '~/components/protocol-badge'
import { SignalChart } from '~/components/signal-chart'
import { StatusDot } from '~/components/status'
import { Badge } from '~/components/ui/badge'
import { Card, CardHint, CardTitle } from '~/components/ui/card'
import { Segmented } from '~/components/ui/segmented'
import { cn } from '~/lib/cn'
import { ago, dateTime, modelText, number, percent } from '~/lib/format'
import { m } from '~/paraglide/messages.js'
import { type DeviceDetail, getDeviceDetail, getOverview } from '~/server/api'

const searchSchema = z.object({
  range: z.enum(['24h', '7d', '30d']).catch('7d').default('7d'),
})

type Range = z.infer<typeof searchSchema>['range']

const detailQuery = (id: number, range: Range) =>
  queryOptions({
    queryKey: ['device', id, range],
    queryFn: () => getDeviceDetail({ data: { id, range } }),
    refetchInterval: 30_000,
  })

/** The header's adapter pills come with the overview, which is usually cached anyway */
const adaptersQuery = queryOptions({
  queryKey: ['overview', '24h'],
  queryFn: () => getOverview({ data: { range: '24h' } }),
  refetchInterval: 30_000,
})

export const Route = createFileRoute('/devices/$id')({
  params: {
    parse: (params) => ({ id: z.coerce.number().int().positive().parse(params.id) }),
    stringify: ({ id }) => ({ id: String(id) }),
  },
  validateSearch: searchSchema,
  search: { middlewares: [stripSearchParams({ range: '7d' })] },
  loaderDeps: ({ search }) => ({ range: search.range }),
  loader: async ({ context, params, deps }) => {
    const [detail] = await Promise.all([
      context.queryClient.ensureQueryData(detailQuery(params.id, deps.range)),
      context.queryClient.ensureQueryData(adaptersQuery),
    ])
    return { title: detail.device.name }
  },
  head: ({ loaderData }) => ({ meta: [{ title: `${loaderData?.title ?? ''} · Funkloch` }] }),
  notFoundComponent: NotFound,
  component: DevicePage,
})

const rangeLabel = (range: Range) =>
  ({ '24h': m.range_24h_short, '7d': m.range_7d_short, '30d': m.range_30d_short })[range]()

const Fact = ({
  label,
  children,
  mono,
}: {
  label: string
  children: ReactNode
  mono?: boolean
}) => (
  <div>
    <dt className="text-xs text-foreground-subtle">{label}</dt>
    <dd className={cn('mt-0.5 text-[13px]', mono && 'font-mono')}>{children}</dd>
  </div>
)

const statusTone = (status: DeviceDetail['status']) =>
  status === 'weak' || status === 'offline' ? 'weak' : 'neutral'

function DevicePage() {
  const { id } = Route.useParams()
  const search = Route.useSearch()
  const navigate = useNavigate({ from: '/devices/$id' })
  const { data } = useSuspenseQuery(detailQuery(id, search.range))
  const { data: overview } = useSuspenseQuery(adaptersQuery)
  const { device, protocol, kpis } = data
  const rawLabel = protocol?.rawLabel ?? ''
  const from = data.now - { '24h': 1, '7d': 7, '30d': 30 }[data.range] * 86_400_000
  const below = data.current && data.weakRaw !== null && data.current.raw < data.weakRaw
  const markers = data.events
    .filter(
      (e) => e.ts >= from && (e.type === 'offline' || e.type === 'online' || e.kind === 'topology'),
    )
    .map((e) => ({ ts: e.ts, label: eventTitle(e) }))

  return (
    <div className="min-h-screen">
      <AppHeader adapters={overview.adapters} />
      <main className="mx-auto flex max-w-[1360px] flex-col gap-5 px-4 pt-6 pb-12 sm:px-8">
        <Link
          to="/"
          className="inline-flex min-h-8 items-center gap-1.5 self-start text-[13px] text-foreground-subtle no-underline hover:text-foreground"
        >
          <ChevronLeft aria-hidden="true" className="size-4" />
          {m.back_all()}
        </Link>

        <div className="flex flex-col gap-2">
          <h1 className="m-0 text-[28px] font-bold tracking-tight">{device.name}</h1>
          <div className="flex flex-wrap items-center gap-2">
            {protocol ? <ProtocolBadge protocol={device.protocol} label={protocol.label} /> : null}
            <Badge>
              {roleLabel(device.role)} · {powerLabel(device.power)}
            </Badge>
            <Badge tone={statusTone(data.status)}>
              <StatusDot status={data.status} className="size-[7px]" />
              {data.trend === 'none'
                ? statusLabel(data.status)
                : m.detail_status_trend({
                    status: statusLabel(data.status),
                    trend: trendLabel(data.trend),
                  })}
            </Badge>
          </div>
        </div>

        <Card>
          <dl className="m-0 grid grid-cols-[repeat(auto-fit,minmax(170px,1fr))] gap-x-6 gap-y-3 px-[18px] py-4">
            <Fact label={m.detail_address()} mono>
              {device.address}
            </Fact>
            {device.networkAddress ? (
              <Fact label={m.detail_network_address()} mono>
                {device.networkAddress}
              </Fact>
            ) : null}
            <Fact label={m.detail_model()}>{modelText(device.vendor, device.model) || '–'}</Fact>
            <Fact label={m.detail_via()}>{data.via ?? '–'}</Fact>
            <Fact label={m.detail_last_seen()}>{ago(device.lastSeen, data.now)}</Fact>
            {device.battery !== null ? (
              <Fact label={m.detail_battery()}>{number(device.battery)} %</Fact>
            ) : null}
          </dl>
        </Card>

        <div className="grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-4">
          <KpiCard
            size="md"
            label={m.kpi_current()}
            value={data.current ? number(data.current.raw) : '–'}
            tone={below ? 'weak' : undefined}
            hint={
              below && data.weakRaw !== null
                ? m.kpi_current_below({ label: rawLabel, value: data.weakRaw })
                : rawLabel
            }
          />
          <KpiCard
            size="md"
            label={m.kpi_median_7d()}
            value={kpis.rawMedian7d === null ? '–' : number(kpis.rawMedian7d)}
            hint={rawLabel}
          />
          <KpiCard
            size="md"
            label={m.kpi_change()}
            value={kpis.changePercent === null ? '–' : percent(kpis.changePercent)}
            tone={kpis.changePercent !== null && kpis.changePercent <= -15 ? 'weak' : undefined}
            hint={m.kpi_change_hint()}
          />
          <KpiCard
            size="md"
            label={m.kpi_parent_changes()}
            value={kpis.parentChanges}
            hint={m.kpi_parent_changes_hint()}
          />
          <KpiCard
            size="md"
            label={m.kpi_messages()}
            value={m.kpi_messages_value({ n: number(kpis.messagesPerHour, 1) })}
            hint={m.kpi_messages_hint()}
          />
        </div>

        <Card className="flex flex-col gap-3.5 px-[18px] pt-4 pb-[18px]">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle>{m.chart_title({ label: rawLabel })}</CardTitle>
              <CardHint>
                {data.range === '24h' ? m.chart_hint_raw() : m.chart_hint_hourly()}
              </CardHint>
            </div>
            <Segmented
              size="sm"
              label={m.range_label()}
              value={search.range}
              options={(['24h', '7d', '30d'] as const).map((value) => ({
                value,
                label: rangeLabel(value),
              }))}
              onChange={(range) => navigate({ search: { range } })}
            />
          </div>
          <ClientOnly fallback={<div style={{ height: 300 }} />}>
            <SignalChart
              series={data.chart}
              from={from}
              to={data.now}
              yMin={protocol?.rawMin ?? 0}
              yMax={protocol?.rawMax ?? 100}
              threshold={data.weakRaw}
              offline={data.offline}
              markers={markers}
              band={data.range !== '24h'}
              color={device.protocol === 'thread' ? '--thread' : '--zigbee'}
              label={m.chart_aria({ label: rawLabel, range: rangeLabel(data.range) })}
            />
          </ClientOnly>
          <div className="flex flex-wrap gap-x-5 gap-y-1.5 text-xs text-foreground-muted">
            <Legend
              swatch={
                <span
                  className="h-0.5 w-4"
                  style={{
                    background: `var(--${device.protocol === 'thread' ? 'thread' : 'zigbee'})`,
                  }}
                />
              }
            >
              {data.range === '24h' ? m.legend_raw() : m.legend_median()}
            </Legend>
            {data.range !== '24h' ? (
              <Legend
                swatch={
                  <span
                    className="h-2.5 w-4 rounded-sm opacity-20"
                    style={{
                      background: `var(--${device.protocol === 'thread' ? 'thread' : 'zigbee'})`,
                    }}
                  />
                }
              >
                {m.legend_band()}
              </Legend>
            ) : null}
            {data.weakRaw !== null ? (
              <Legend swatch={<span className="h-0 w-4 border-t-2 border-dashed border-weak" />}>
                {m.legend_threshold({ label: rawLabel, value: data.weakRaw })}
              </Legend>
            ) : null}
            <Legend
              swatch={
                <span className="size-2.5 rounded-sm" style={{ background: 'var(--chart-gap)' }} />
              }
            >
              {m.legend_offline()}
            </Legend>
          </div>
        </Card>

        <div className="flex flex-wrap items-stretch gap-4">
          <Card className="flex min-w-0 flex-[999_1_560px] flex-col gap-3 px-[18px] pt-4 pb-[18px]">
            <div>
              <CardTitle>{m.messages_title()}</CardTitle>
              <CardHint>{m.messages_hint()}</CardHint>
            </div>
            <MessagesChart
              values={data.messages.values}
              label={m.messages_aria({
                max: Math.max(0, ...data.messages.values.map((v) => v ?? 0)),
              })}
              ticks={[data.messages.from, data.messages.from + 24 * 3_600_000, data.now].map(
                dateTime,
              )}
            />
          </Card>

          <Card className="flex min-w-0 flex-[1_1_360px] flex-col gap-3 px-[18px] pt-4 pb-[18px]">
            <div>
              <CardTitle>{m.links_title()}</CardTitle>
              {data.topologyTs !== null ? (
                <CardHint>{m.links_hint({ ago: ago(data.topologyTs, data.now) })}</CardHint>
              ) : null}
            </div>
            {data.links.length === 0 ? (
              <p className="text-foreground-subtle">{m.links_none()}</p>
            ) : (
              <ul className="m-0 flex list-none flex-col p-0">
                {data.links.map((link) => (
                  <li
                    key={`${link.kind}-${link.id}`}
                    className="grid grid-cols-[minmax(0,1fr)_72px] items-center gap-x-3 gap-y-1 border-b border-border-subtle py-[9px]"
                  >
                    <div className="flex min-w-0 flex-col">
                      <Link
                        to="/devices/$id"
                        params={{ id: link.id }}
                        className="font-semibold no-underline"
                      >
                        {link.name}
                      </Link>
                      <span className="text-xs text-foreground-subtle">
                        {{ parent: m.link_parent, child: m.link_child, neighbor: m.link_neighbor }[
                          link.kind
                        ]({
                          role: roleLabel(link.role),
                        })}
                      </span>
                    </div>
                    <LinkQuality lqi={link.lqi} rssi={link.rssi} protocol={device.protocol} />
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <Card className="px-[18px] pt-4 pb-2">
          <CardTitle className="mb-1.5">{m.events_title()}</CardTitle>
          {data.events.length === 0 ? (
            <p className="py-2 text-foreground-subtle">{m.events_none()}</p>
          ) : (
            <ol className="m-0 list-none p-0">
              {data.events.map((event) => (
                <li
                  key={event.id}
                  className="grid grid-cols-[14px_150px_minmax(0,1fr)] items-baseline gap-3 border-t border-border-subtle py-2.5"
                >
                  <span
                    aria-hidden="true"
                    className={cn('size-2 self-center rounded-full', eventColor(event))}
                  />
                  <span className="font-mono text-xs text-foreground-subtle">
                    {dateTime(event.ts)}
                  </span>
                  <span>
                    <strong className="font-semibold">{eventTitle(event)}</strong>{' '}
                    <span className="text-foreground-subtle">{eventDetail(event)}</span>
                  </span>
                </li>
              ))}
            </ol>
          )}
        </Card>
      </main>
    </div>
  )
}

const Legend = ({ swatch, children }: { swatch: ReactNode; children: ReactNode }) => (
  <span className="inline-flex items-center gap-1.5">
    {swatch}
    {children}
  </span>
)

const LinkQuality = ({
  lqi,
  rssi,
  protocol,
}: {
  lqi: number | null
  rssi: number | null
  protocol: string
}) => {
  const max = protocol === 'zigbee' ? 255 : 3
  const pct = lqi === null ? 0 : Math.round((lqi / max) * 100)
  return (
    <div className="flex flex-col items-end gap-1">
      <span className="font-mono text-xs text-foreground-muted">
        {lqi === null ? '–' : `LQI ${lqi}`}
        {rssi !== null ? ` · ${rssi} dBm` : ''}
      </span>
      <div className="h-[5px] w-[72px] overflow-hidden rounded-[3px] bg-track">
        <div
          className="h-[5px]"
          style={{
            width: `${pct}%`,
            background: pct < 25 ? 'var(--status-weak)' : 'var(--status-good)',
          }}
        />
      </div>
    </div>
  )
}
