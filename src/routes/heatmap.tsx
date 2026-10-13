import { queryOptions, useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute, Link, stripSearchParams, useNavigate } from '@tanstack/react-router'
import { z } from 'zod'
import { AppHeader } from '~/components/app-header'
import { HeatRow } from '~/components/heat-row'
import { Card, CardHeader, CardHint, CardTitle } from '~/components/ui/card'
import { ChipFilter } from '~/components/ui/chip-filter'
import { Segmented } from '~/components/ui/segmented'
import { cn } from '~/lib/cn'
import { duration } from '~/lib/format'
import { m } from '~/paraglide/messages.js'
import { getLocale } from '~/paraglide/runtime.js'
import { getHeatmap } from '~/server/fn/pages'

const searchSchema = z.object({
  days: z
    .union([z.literal(7), z.literal(30)])
    .catch(7)
    .default(7),
  protocol: z.string().max(40).catch('all').default('all'),
})

type Search = z.infer<typeof searchSchema>

const heatmapQuery = (days: Search['days']) =>
  queryOptions({
    queryKey: ['heatmap', days],
    queryFn: () => getHeatmap({ data: { days } }),
    refetchInterval: 5 * 60_000,
  })

export const Route = createFileRoute('/heatmap')({
  validateSearch: searchSchema,
  search: { middlewares: [stripSearchParams({ days: 7, protocol: 'all' })] },
  loaderDeps: ({ search }) => ({ days: search.days }),
  loader: ({ context, deps }) => context.queryClient.ensureQueryData(heatmapQuery(deps.days)),
  head: () => ({ meta: [{ title: `${m.heatmap_title()} · Funkloch` }] }),
  component: HeatmapPage,
})

const Swatch = ({ color, children }: { color: string; children: string }) => (
  <span className="inline-flex items-center gap-1.5">
    <span className="size-3.5 rounded-[3px]" style={{ background: color }} />
    {children}
  </span>
)

const Finding = ({
  title,
  tone,
  to,
  name,
  text,
}: {
  title: string
  tone?: 'weak'
  to: number
  name: string
  text: string
}) => (
  <Card className="flex flex-col gap-1 px-[18px] py-3.5">
    <span
      className={cn(
        'text-xs font-semibold',
        tone === 'weak' ? 'text-weak' : 'text-foreground-muted',
      )}
    >
      {title}
    </span>
    <Link to="/devices/$id" params={{ id: to }} className="font-semibold no-underline">
      {name}
    </Link>
    <span className="text-[13px] text-foreground-muted">{text}</span>
  </Card>
)

function HeatmapPage() {
  const search = Route.useSearch()
  const navigate = useNavigate({ from: '/heatmap' })
  const { data } = useSuspenseQuery(heatmapQuery(search.days))
  const rows =
    search.protocol === 'all' ? data.rows : data.rows.filter((r) => r.protocol === search.protocol)
  const dayFormat = new Intl.DateTimeFormat(getLocale(), {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
  })
  const step = data.days === 7 ? 1 : 5
  const dayTicks = Array.from(
    { length: data.days },
    (_, i) => data.from + i * 24 * data.hourMs,
  ).filter((_, i) => i % step === 0)
  const { patterns, falling, offline } = data.findings
  const bands = { ...data.thresholds, mid: data.thresholds.good - 1 }
  const findings = patterns.length + falling.length + offline.length

  return (
    <div className="min-h-screen">
      <AppHeader adapters={data.adapters} />
      <main className="mx-auto flex max-w-[1360px] flex-col gap-5 px-4 pt-7 pb-12 sm:px-8">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="m-0 text-[26px] font-bold tracking-tight">{m.heatmap_title()}</h1>
            <p className="mt-1 text-foreground-subtle">{m.heatmap_subtitle()}</p>
          </div>
          <Segmented
            label={m.range_label()}
            value={String(search.days) as '7' | '30'}
            options={[
              { value: '7', label: m.range_7d() },
              { value: '30', label: m.range_30d() },
            ]}
            onChange={(value) =>
              navigate({ search: (prev) => ({ ...prev, days: Number(value) as Search['days'] }) })
            }
          />
        </div>

        {findings === 0 ? (
          <p className="m-0 text-foreground-subtle">{m.findings_none()}</p>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fit,minmax(260px,1fr))] gap-4">
            {patterns.map((p) => (
              <Finding
                key={`p-${p.id}`}
                tone="weak"
                title={m.finding_pattern()}
                to={p.id}
                name={p.name}
                text={m.finding_pattern_text({ from: p.from, to: p.to, days: p.days })}
              />
            ))}
            {falling.map((d) => (
              <Finding
                key={`f-${d.id}`}
                tone="weak"
                title={m.finding_falling()}
                to={d.id}
                name={d.name}
                text={m.finding_falling_text()}
              />
            ))}
            {offline.map((d) => (
              <Finding
                key={`o-${d.id}`}
                title={m.finding_offline()}
                to={d.id}
                name={d.name}
                text={m.finding_offline_text({
                  duration: duration(data.now - (d.lastSeen ?? data.now)),
                })}
              />
            ))}
          </div>
        )}

        <Card>
          <CardHeader>
            <div>
              <CardTitle>{m.heatmap_all({ days: data.days })}</CardTitle>
              <CardHint>{m.heatmap_hint()}</CardHint>
            </div>
            {data.protocols.length > 1 ? (
              <ChipFilter
                label={m.filter_label()}
                value={search.protocol}
                options={[
                  { value: 'all', label: m.filter_all({ count: data.rows.length }) },
                  ...data.protocols.map((p) => ({
                    value: p.id,
                    label: m.filter_protocol({
                      label: p.label,
                      count: data.rows.filter((r) => r.protocol === p.id).length,
                    }),
                  })),
                ]}
                onChange={(protocol) => navigate({ search: (prev) => ({ ...prev, protocol }) })}
              />
            ) : null}
          </CardHeader>
          <div className="overflow-x-auto">
            <div className="flex min-w-[900px] flex-col gap-1 px-[18px] pt-3 pb-4">
              <div aria-hidden="true" className="mb-1 grid grid-cols-[220px_minmax(0,1fr)] gap-3">
                <span />
                <div className="relative h-4 font-mono text-[11px] text-foreground-subtle">
                  {dayTicks.map((ts, i) => (
                    <span
                      key={ts}
                      className="absolute"
                      style={{ left: `${((i * step) / data.days) * 100}%` }}
                    >
                      {dayFormat.format(ts)}
                    </span>
                  ))}
                </div>
              </div>
              {rows.map((row) => (
                <div
                  key={row.id}
                  data-testid="heat-row"
                  className="grid grid-cols-[220px_minmax(0,1fr)] items-center gap-3"
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <span
                      className={cn(
                        'shrink-0 rounded px-1.5 text-[10px] font-bold',
                        row.protocol === 'zigbee'
                          ? 'bg-zigbee-bg text-zigbee'
                          : 'bg-thread-bg text-thread',
                      )}
                    >
                      {row.protocol === 'zigbee'
                        ? 'ZB'
                        : row.protocol === 'thread'
                          ? 'TH'
                          : row.protocol}
                    </span>
                    <Link
                      to="/devices/$id"
                      params={{ id: row.id }}
                      className="truncate text-[13px] font-medium no-underline hover:underline"
                    >
                      {row.name}
                    </Link>
                  </div>
                  <HeatRow
                    cells={row.cells}
                    label={m.heatmap_row_label({ name: row.name, days: data.days })}
                  />
                </div>
              ))}
            </div>
          </div>
          <div className="flex flex-wrap gap-x-5 gap-y-1.5 border-t border-border px-[18px] py-3 text-xs text-foreground-muted">
            <Swatch color="var(--heat-good)">{m.legend_good(bands)}</Swatch>
            <Swatch color="var(--heat-mid)">{m.legend_mid(bands)}</Swatch>
            <Swatch color="var(--heat-weak)">{m.legend_weak(bands)}</Swatch>
            <Swatch color="var(--heat-offline)">{m.status_offline()}</Swatch>
            <Swatch color="var(--heat-none)">{m.heatmap_legend_none()}</Swatch>
            <span className="text-foreground-subtle">{m.heatmap_click()}</span>
          </div>
        </Card>
      </main>
    </div>
  )
}
