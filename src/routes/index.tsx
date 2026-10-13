import { queryOptions, useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { createColumnHelper, tableFeatures, useTable } from '@tanstack/react-table'
import { useMemo } from 'react'
import { z } from 'zod'
import { AppHeader } from '~/components/app-header'
import { KpiCard } from '~/components/kpi-card'
import { roleLabel, statusVar, trendColor, trendLabel } from '~/components/labels'
import { ProtocolBadge } from '~/components/protocol-badge'
import { Sparkline } from '~/components/sparkline'
import { StatusLabel } from '~/components/status'
import { Card, CardHeader, CardTitle } from '~/components/ui/card'
import { ChipFilter } from '~/components/ui/chip-filter'
import { Segmented } from '~/components/ui/segmented'
import { cn } from '~/lib/cn'
import { ago, duration, modelText } from '~/lib/format'
import { m } from '~/paraglide/messages.js'
import { getOverview, type Overview } from '~/server/api'

const searchSchema = z.object({
  range: z.enum(['24h', '7d']).catch('24h').default('24h'),
  protocol: z.string().catch('all').default('all'),
})

type Range = z.infer<typeof searchSchema>['range']

const overviewQuery = (range: Range) =>
  queryOptions({
    queryKey: ['overview', range],
    queryFn: () => getOverview({ data: { range } }),
    refetchInterval: 30_000,
  })

export const Route = createFileRoute('/')({
  validateSearch: searchSchema,
  loaderDeps: ({ search }) => ({ range: search.range }),
  loader: ({ context, deps }) => context.queryClient.ensureQueryData(overviewQuery(deps.range)),
  head: () => ({ meta: [{ title: `${m.devices_title()} · Funkloch` }] }),
  component: DevicesPage,
})

type Row = Overview['rows'][number]

const features = tableFeatures({})
const helper = createColumnHelper<typeof features, Row>()

// One grid for header and rows; without a second protocol the protocol column goes
const grid = (showProtocol: boolean) =>
  cn(
    'grid items-center gap-3 px-[18px]',
    showProtocol
      ? 'grid-cols-[100px_minmax(190px,2fr)_80px_130px_minmax(140px,1.3fr)_140px_100px_110px_minmax(150px,1.4fr)]'
      : 'grid-cols-[100px_minmax(190px,2fr)_130px_minmax(140px,1.3fr)_140px_100px_110px_minmax(150px,1.4fr)]',
  )

function DevicesPage() {
  const search = Route.useSearch()
  const navigate = useNavigate({ from: '/' })
  const { data } = useSuspenseQuery(overviewQuery(search.range))
  const labels = new Map(data.protocols.map((p) => [p.id, p.label]))
  const showProtocol = data.protocols.length > 1
  const rangeShort = search.range === '7d' ? m.range_7d_short() : m.range_24h_short()

  const columns = useMemo(
    () =>
      helper.columns([
        helper.accessor('status', {
          header: m.col_status(),
          cell: (c) => <StatusLabel status={c.getValue()} />,
        }),
        helper.accessor('name', {
          header: m.col_device(),
          cell: (c) => (
            <div className="flex min-w-0 flex-col">
              <Link
                to="/devices/$id"
                params={{ id: c.row.original.id }}
                className="font-semibold no-underline hover:text-zigbee"
              >
                {c.getValue()}
              </Link>
              <span className="truncate text-xs text-foreground-subtle">
                {modelText(c.row.original.vendor, c.row.original.model)}
              </span>
            </div>
          ),
        }),
        helper.accessor('protocol', {
          header: m.col_protocol(),
          cell: (c) => (
            <ProtocolBadge
              protocol={c.getValue()}
              label={labels.get(c.getValue()) ?? c.getValue()}
            />
          ),
        }),
        helper.accessor('role', {
          header: m.col_role(),
          cell: (c) => (
            <span className="text-[13px] text-foreground-muted">{roleLabel(c.getValue())}</span>
          ),
        }),
        helper.accessor('score', {
          header: m.col_signal(),
          cell: (c) => (
            <div className="flex flex-col gap-[5px]">
              <div className="h-1.5 overflow-hidden rounded-[3px] bg-track">
                <div
                  className="h-1.5 rounded-[3px]"
                  style={{
                    width: `${c.getValue() ?? 0}%`,
                    background: statusVar[c.row.original.status],
                  }}
                />
              </div>
              <span className="font-mono text-xs text-foreground-muted">
                {c.row.original.rawText ?? '–'}
              </span>
            </div>
          ),
        }),
        helper.accessor('spark', {
          header: m.col_history({ range: rangeShort }),
          cell: (c) => (
            <Sparkline
              values={c.getValue()}
              color={statusVar[c.row.original.status]}
              label={m.spark_label({ range: rangeShort, trend: trendLabel(c.row.original.trend) })}
            />
          ),
        }),
        helper.accessor('trend', {
          header: m.col_trend(),
          cell: (c) => (
            <span className={cn('text-[13px] font-medium', trendColor[c.getValue()])}>
              {trendLabel(c.getValue())}
            </span>
          ),
        }),
        helper.accessor('lastSeen', {
          header: m.col_last_seen(),
          cell: (c) => (
            <span className="font-mono text-xs text-foreground-muted">
              {ago(c.getValue(), data.now)}
            </span>
          ),
        }),
        helper.accessor('via', {
          header: m.col_via(),
          cell: (c) => (
            <span className="text-[13px] text-foreground-muted">{c.getValue() ?? '–'}</span>
          ),
        }),
      ]),
    [data.now, rangeShort, labels],
  )

  const rows = useMemo(
    () =>
      search.protocol === 'all'
        ? data.rows
        : data.rows.filter((r) => r.protocol === search.protocol),
    [data.rows, search.protocol],
  )
  const table = useTable({ features, columns, data: rows })

  const offline = data.rows.filter((r) => r.status === 'offline')
  const longestOffline = offline.reduce<Row | null>(
    (oldest, row) =>
      oldest === null || (row.lastSeen ?? 0) < (oldest.lastSeen ?? 0) ? row : oldest,
    null,
  )

  return (
    <div className="min-h-screen">
      <AppHeader adapters={data.adapters} />
      <main className="mx-auto flex max-w-[1360px] flex-col gap-5 px-4 pt-7 pb-12 sm:px-8">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="m-0 text-[26px] font-bold tracking-tight">{m.devices_title()}</h1>
            <p className="mt-1 text-foreground-subtle">{m.devices_subtitle()}</p>
          </div>
          <Segmented
            label={m.range_label()}
            value={search.range}
            options={[
              { value: '24h', label: m.range_24h() },
              { value: '7d', label: m.range_7d() },
            ]}
            onChange={(range) => navigate({ search: (prev) => ({ ...prev, range }) })}
          />
        </div>

        <div className="grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-4">
          <KpiCard
            label={m.kpi_devices()}
            value={data.counts.total}
            hint={data.protocols
              .map((p) => `${data.counts.byProtocol[p.id] ?? 0} ${p.label}`)
              .join(' · ')}
          />
          <KpiCard
            label={m.kpi_offline()}
            value={data.counts.offline}
            hint={
              longestOffline
                ? m.kpi_offline_since({
                    name: longestOffline.name,
                    duration: duration(data.now - (longestOffline.lastSeen ?? data.now)),
                  })
                : m.kpi_offline_none()
            }
          />
          <KpiCard
            label={m.kpi_weak()}
            value={data.counts.weak}
            tone={data.counts.weak > 0 ? 'weak' : undefined}
            hint={m.kpi_weak_hint()}
          />
          <KpiCard
            label={m.kpi_down()}
            value={data.counts.down}
            tone={data.counts.down > 0 ? 'weak' : undefined}
            hint={m.kpi_down_hint()}
          />
        </div>

        <Card>
          <CardHeader>
            <CardTitle>{m.table_title()}</CardTitle>
            {showProtocol ? (
              <ChipFilter
                label={m.filter_label()}
                value={search.protocol}
                options={[
                  { value: 'all', label: m.filter_all({ count: data.counts.total }) },
                  ...data.protocols.map((p) => ({
                    value: p.id,
                    label: m.filter_protocol({
                      label: p.label,
                      count: data.counts.byProtocol[p.id] ?? 0,
                    }),
                  })),
                ]}
                onChange={(protocol) => navigate({ search: (prev) => ({ ...prev, protocol }) })}
              />
            ) : null}
          </CardHeader>

          {data.rows.length === 0 ? (
            <div className="flex flex-col gap-1 px-[18px] py-10 text-center">
              <span className="font-semibold">{m.empty_title()}</span>
              <span className="text-foreground-subtle">{m.empty_text()}</span>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="block min-w-[1240px]">
                <thead className="block">
                  {table.getHeaderGroups().map((group) => (
                    <tr
                      key={group.id}
                      className={cn(
                        grid(showProtocol),
                        'border-b border-border bg-surface-muted py-2.5 text-xs font-medium text-foreground-subtle',
                      )}
                    >
                      {group.headers
                        .filter((h) => showProtocol || h.column.id !== 'protocol')
                        .map((header) => (
                          <th key={header.id} scope="col" className="text-left font-medium">
                            <table.FlexRender header={header} />
                          </th>
                        ))}
                    </tr>
                  ))}
                </thead>
                <tbody className="block">
                  {table.getRowModel().rows.map((row) => (
                    <tr
                      key={row.id}
                      data-testid="device-row"
                      className={cn(grid(showProtocol), 'border-b border-border-subtle py-[11px]')}
                    >
                      {row
                        .getAllCells()
                        .filter((cell) => showProtocol || cell.column.id !== 'protocol')
                        .map((cell) => (
                          <td key={cell.id} className="min-w-0">
                            <table.FlexRender cell={cell} />
                          </td>
                        ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              {rows.length === 0 ? (
                <p className="px-[18px] py-6 text-center text-foreground-subtle">
                  {m.empty_filter()}
                </p>
              ) : null}
            </div>
          )}

          <div className="flex flex-wrap gap-x-6 gap-y-1.5 px-[18px] py-3 text-xs text-foreground-subtle">
            <span>{m.table_footer_scale()}</span>
            <span>{m.table_footer_bands()}</span>
            <span>{m.table_footer_click()}</span>
          </div>
        </Card>
      </main>
    </div>
  )
}
