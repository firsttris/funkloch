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
import { DeviceLinks } from '~/components/device-links'
import { DeviceTitle } from '~/components/device-title'
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
import { protocolStyle } from '~/components/protocol-style'
import { RouterFindingCard } from '~/components/router-finding-card'
import { SignalChart } from '~/components/signal-chart'
import { StatusDot } from '~/components/status'
import { TxErrorsCard } from '~/components/tx-errors-card'
import { Badge } from '~/components/ui/badge'
import { Card, CardHint, CardTitle } from '~/components/ui/card'
import { Segmented } from '~/components/ui/segmented'
import { cn } from '~/lib/cn'
import { ago, dateTime, modelText, number, percent } from '~/lib/format'
import { m } from '~/paraglide/messages.js'
import { getDeviceDetail, getOverview } from '~/server/fn/pages'
import type { DeviceDetail } from '~/server/views/device'

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
          <DeviceTitle
            key={device.id}
            id={device.id}
            name={device.name}
            customName={device.customName}
            networkName={device.networkName}
          />
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

        {data.finding ? (
          <RouterFindingCard
            finding={data.finding}
            topologyTs={data.topologyTs}
            txErrorRate={
              data.txErrors?.high && data.txErrors.day ? data.txErrors.day.rate * 100 : null
            }
            now={data.now}
          />
        ) : null}

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
          {data.txErrors ? <TxErrorsKpi txErrors={data.txErrors} /> : null}
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
              color={protocolStyle(device.protocol).color}
              label={m.chart_aria({ label: rawLabel, range: rangeLabel(data.range) })}
            />
          </ClientOnly>
          <div className="flex flex-wrap gap-x-5 gap-y-1.5 text-xs text-foreground-muted">
            <Legend
              swatch={
                <span
                  className="h-0.5 w-4"
                  style={{
                    background: `var(${protocolStyle(device.protocol).color})`,
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
                      background: `var(${protocolStyle(device.protocol).color})`,
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

        {data.txErrors ? <TxErrorsCard txErrors={data.txErrors} now={data.now} /> : null}

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

          <DeviceLinks data={data} />
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

const TxErrorsKpi = ({ txErrors }: { txErrors: NonNullable<DeviceDetail['txErrors']> }) => {
  const { day, threshold } = txErrors
  return (
    <KpiCard
      size="md"
      label={m.kpi_tx_errors()}
      value={day ? `${number(day.rate * 100, 1)} %` : '–'}
      tone={day && day.rate * 100 >= threshold ? 'weak' : undefined}
      hint={
        day
          ? m.kpi_tx_errors_hint({
              errors: number(day.errors),
              frames: number(day.frames),
              threshold: number(threshold),
            })
          : m.kpi_tx_errors_none()
      }
    />
  )
}
