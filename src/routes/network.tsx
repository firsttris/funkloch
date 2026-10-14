import { queryOptions, useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute, Link, stripSearchParams, useNavigate } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import { z } from 'zod'
import { AppHeader } from '~/components/app-header'
import { BottleneckHint } from '~/components/bottleneck-hint'
import { HistoryArea } from '~/components/history-area'
import { roleLabel, statusLabel, statusVar } from '~/components/labels'
import { NetworkTree, SNAPSHOT_DAYS_CLIENT } from '~/components/network-tree'
import { KIND_ICON, SignalBars } from '~/components/network-tree-parts'
import { StatusDot } from '~/components/status'
import { Badge } from '~/components/ui/badge'
import { Card, CardTitle } from '~/components/ui/card'
import { Segmented } from '~/components/ui/segmented'
import type { Status } from '~/core/types'
import { cn } from '~/lib/cn'
import { dateTime, number } from '~/lib/format'
import { m } from '~/paraglide/messages.js'
import { getNetwork, requestTopology } from '~/server/fn/pages'
import type { NetworkView } from '~/server/views/network'

const searchSchema = z.object({
  protocol: z.string().max(40).optional().catch(undefined),
  snapshot: z.number().int().positive().optional().catch(undefined),
  device: z.number().int().positive().optional().catch(undefined),
})

type Search = z.infer<typeof searchSchema>

const networkQuery = (search: Search) =>
  queryOptions({
    queryKey: ['network', search.protocol ?? null, search.snapshot ?? null, search.device ?? null],
    queryFn: () =>
      getNetwork({
        data: {
          protocol: search.protocol ?? null,
          snapshot: search.snapshot ?? null,
          device: search.device ?? null,
        },
      }),
    refetchInterval: 60_000,
  })

export const Route = createFileRoute('/network')({
  validateSearch: searchSchema,
  search: { middlewares: [stripSearchParams({})] },
  loaderDeps: ({ search }) => search,
  loader: ({ context, deps }) => context.queryClient.ensureQueryData(networkQuery(deps)),
  head: () => ({ meta: [{ title: `${m.network_title()} · Funkloch` }] }),
  component: NetworkPage,
})

function NetworkPage() {
  const search = Route.useSearch()
  const navigate = useNavigate({ from: '/network' })
  const queryClient = useQueryClient()
  const { data } = useSuspenseQuery(networkQuery(search))
  const protocolLabel = data.protocols.find((p) => p.id === data.protocol)?.label ?? data.protocol
  const index = data.snapshot ? data.snapshots.findIndex((s) => s.id === data.snapshot?.id) : -1

  const request = useMutation({
    mutationFn: () => requestTopology({ data: { protocol: data.protocol } }),
    onSuccess: () => {
      // The demo answers at once, Zigbee2MQTT within minutes; the page refreshes every minute
      setTimeout(() => queryClient.invalidateQueries({ queryKey: ['network'] }), 1500)
      navigate({ search: (prev) => ({ ...prev, snapshot: undefined }) })
    },
  })

  return (
    <div className="min-h-screen">
      <AppHeader adapters={data.adapters} />
      <main className="mx-auto flex max-w-[1360px] flex-col gap-5 px-4 pt-7 pb-12 sm:px-8">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="m-0 text-[26px] font-bold tracking-tight">{m.network_title()}</h1>
            <p className="mt-1 text-foreground-subtle">{m.network_subtitle()}</p>
          </div>
          {data.protocols.length > 1 ? (
            <Segmented
              label={m.network_pick()}
              value={data.protocol}
              options={data.protocols.map((p) => ({ value: p.id, label: p.label }))}
              onChange={(protocol) => navigate({ search: { protocol } })}
            />
          ) : null}
        </div>

        <BottleneckHint bottlenecks={data.bottlenecks} onMap />

        <div className="flex flex-wrap items-start gap-4">
          <Card className="min-w-0 flex-[999_1_640px] p-3">
            {data.edges.length === 0 && data.nodes.length <= 1 ? (
              <p className="px-3 py-16 text-center text-foreground-subtle">{m.network_empty()}</p>
            ) : (
              <NetworkTree
                nodes={data.nodes}
                edges={data.edges}
                selectedId={data.selected?.id ?? null}
                label={m.network_aria({
                  label: protocolLabel,
                  nodes: data.nodes.length,
                  edges: data.edges.length,
                })}
                onSelect={(device) =>
                  navigate({
                    search: (prev) => ({ ...prev, device }),
                    replace: true,
                    resetScroll: false,
                  })
                }
              />
            )}
          </Card>

          <aside className="flex min-w-0 flex-[1_1_320px] flex-col gap-4">
            <Card className="flex flex-col gap-3 px-[18px] py-4">
              <span className="text-xs font-medium text-foreground-subtle">
                {m.network_selected()}
              </span>
              {data.selected ? (
                <div className="flex flex-col gap-3">
                  <div>
                    <h2 className="m-0 text-[17px] font-bold">{data.selected.name}</h2>
                    <Badge
                      className="mt-1.5"
                      tone={
                        data.selected.status === 'weak' || data.selected.status === 'offline'
                          ? 'weak'
                          : 'neutral'
                      }
                    >
                      <StatusDot status={data.selected.status} className="size-[7px]" />
                      {statusLabel(data.selected.status)}
                    </Badge>
                  </div>
                  <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-[13px]">
                    <dt className="text-foreground-subtle">{m.col_role()}</dt>
                    <dd className="m-0">{roleLabel(data.selected.role)}</dd>
                    <dt className="text-foreground-subtle">{m.network_parent()}</dt>
                    <dd className="m-0">{data.selected.parent ?? '–'}</dd>
                    <dt className="text-foreground-subtle">{m.network_parent_link()}</dt>
                    <dd className="m-0 font-mono">{data.selected.parentLink ?? '–'}</dd>
                    <dt className="text-foreground-subtle">{m.network_hops()}</dt>
                    <dd className="m-0 font-mono">{data.selected.hops ?? '–'}</dd>
                    <dt className="text-foreground-subtle">{m.network_neighbors()}</dt>
                    <dd className="m-0 font-mono">{number(data.selected.neighbors)}</dd>
                  </dl>
                  {data.selected.history ? (
                    <History history={data.selected.history} status={data.selected.status} />
                  ) : null}
                  {data.selected.way.length > 1 ? <Way way={data.selected.way} /> : null}
                  {data.selected.root ? null : (
                    <Link
                      to="/devices/$id"
                      params={{ id: data.selected.id }}
                      className="inline-flex min-h-10 items-center justify-center rounded-md bg-primary font-semibold text-primary-foreground no-underline"
                    >
                      {m.network_open()}
                    </Link>
                  )}
                </div>
              ) : (
                <p className="m-0 text-[13px] text-foreground-muted">{m.network_select_hint()}</p>
              )}
            </Card>

            <Card className="flex flex-col gap-2.5 px-[18px] py-4">
              <label htmlFor="snapshot" className="text-sm font-semibold">
                {m.network_snapshot()}
              </label>
              <input
                id="snapshot"
                type="range"
                min={0}
                max={Math.max(data.snapshots.length - 1, 0)}
                value={index < 0 ? 0 : index}
                disabled={data.snapshots.length < 2}
                aria-valuetext={data.snapshot ? dateTime(data.snapshot.ts) : undefined}
                onChange={(event) => {
                  const picked = data.snapshots[Number(event.target.value)]
                  const latest = picked?.id === data.snapshots.at(-1)?.id
                  navigate({
                    search: (prev) => ({ ...prev, snapshot: latest ? undefined : picked?.id }),
                    replace: true,
                    resetScroll: false,
                  })
                }}
                className="min-h-7 w-full accent-primary"
              />
              <div
                aria-hidden="true"
                className="flex justify-between font-mono text-[11px] text-foreground-subtle"
              >
                <span>{m.network_oldest({ days: SNAPSHOT_DAYS_CLIENT })}</span>
                <span>{m.network_newest()}</span>
              </div>
              <p className="m-0 text-[13px] text-foreground-muted">
                {data.snapshot
                  ? `${m.network_snapshot_of({ date: dateTime(data.snapshot.ts) })} `
                  : ''}
                {m.network_snapshot_hint({ hours: number(data.networkmapHours) })}
              </p>
              {data.canRequest ? (
                <button
                  type="button"
                  disabled={request.isPending}
                  onClick={() => request.mutate()}
                  className="min-h-10 cursor-pointer rounded-md border border-border bg-surface font-medium hover:bg-track disabled:cursor-wait"
                >
                  {m.network_request()}
                </button>
              ) : null}
              {request.isSuccess ? (
                <p role="status" className="m-0 text-[13px] text-foreground-muted">
                  {m.network_requested()}
                </p>
              ) : null}
              {request.isError ? (
                <p role="alert" className="m-0 text-[13px] text-weak">
                  {m.network_request_failed()}
                </p>
              ) : null}
            </Card>

            <Legend />
          </aside>
        </div>
      </main>
    </div>
  )
}

/** The selected device and each parent up to the root, as a chain of small tiles */
type DayHistory = NonNullable<NonNullable<NetworkView['selected']>['history']>

/** The selected device's raw value over the last day, as an area that draws itself */
const History = ({ history, status }: { history: DayHistory; status: Status }) => {
  const last = history.values.filter((v): v is number => v !== null).at(-1)
  const title = m.network_history({ label: history.label })
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-foreground-subtle">{title}</span>
      {last === undefined ? (
        <p className="m-0 text-[13px] text-foreground-muted">{m.network_history_empty()}</p>
      ) : (
        <>
          <HistoryArea
            values={history.values}
            min={history.min}
            max={history.max}
            color={statusVar[status]}
            label={title}
          />
          <div className="flex justify-between font-mono text-[11px] text-foreground-subtle">
            <span>{m.network_history_ago()}</span>
            <span>{m.network_history_now({ value: number(last) })}</span>
          </div>
        </>
      )}
    </div>
  )
}

type WayStep = NonNullable<NetworkView['selected']>['way'][number]

const Way = ({ way }: { way: WayStep[] }) => (
  <div className="flex flex-col">
    <span className="mb-1 text-xs font-medium text-foreground-subtle">{m.network_way()}</span>
    {way.map((step, i) => {
      const Icon = KIND_ICON[step.kind]
      const previous = way[i - 1]
      return (
        <div
          key={step.id}
          className="relative grid grid-cols-[28px_1fr_auto] items-center gap-2.5 py-1"
        >
          {previous ? (
            <span
              aria-hidden="true"
              className="absolute -top-2 left-[13px] h-3.5 border-l-2"
              style={{
                borderColor:
                  previous.quality === 'weak' ? 'var(--status-weak)' : 'var(--chart-axis)',
              }}
            />
          ) : null}
          <span
            className={cn(
              'grid size-7 place-items-center rounded-lg',
              step.root
                ? 'bg-primary text-primary-foreground'
                : 'bg-surface-muted text-foreground-muted shadow-[inset_0_0_0_1px_var(--border)]',
            )}
          >
            <Icon size={15} strokeWidth={1.7} aria-hidden="true" />
          </span>
          <span className="truncate text-[13px] font-medium">{step.name}</span>
          {step.label ? (
            <span className="flex items-center gap-1.5 font-mono text-[11.5px]">
              <SignalBars bars={step.bars} quality={step.quality} />
              {step.label}
            </span>
          ) : (
            <span />
          )}
        </div>
      )
    })}
  </div>
)

const Swatch = ({ children }: { children: ReactNode }) => (
  <svg width="26" height="22" viewBox="0 0 26 22" aria-hidden="true" className="shrink-0">
    {children}
  </svg>
)

const Legend = () => (
  <Card className="flex flex-col gap-2.5 px-[18px] py-4 text-[13px] text-foreground-muted">
    <CardTitle className="text-sm">{m.legend_title()}</CardTitle>
    <span className="flex items-center gap-2.5">
      <Swatch>
        <rect x="3" y="1" width="20" height="20" rx="6" className="fill-primary" />
      </Swatch>
      {m.legend_tile_root()}
    </span>
    <span className="flex items-center gap-2.5">
      <Swatch>
        <rect x="3" y="1" width="20" height="20" rx="6" className="fill-surface stroke-border" />
        <circle cx="21" cy="3" r="3" fill="var(--status-good)" />
      </Swatch>
      {m.legend_tile_router()}
    </span>
    <span className="flex items-center gap-2.5">
      <Swatch>
        <circle cx="7" cy="11" r="4" fill="var(--status-good)" />
        <circle cx="19" cy="11" r="4" fill="var(--status-weak)" />
      </Swatch>
      {m.legend_dot()}
    </span>
    <span className="flex items-center gap-2.5">
      <Swatch>
        <line x1="0" y1="11" x2="26" y2="11" stroke="var(--chart-axis)" strokeWidth="2" />
      </Swatch>
      {m.legend_line()}
    </span>
    <span className="flex items-center gap-2.5">
      <Swatch>
        <line x1="0" y1="11" x2="26" y2="11" stroke="var(--status-weak)" strokeWidth="2" />
      </Swatch>
      {m.legend_line_weak()}
    </span>
    <span className="flex items-center gap-2.5">
      <Swatch>
        <line x1="0" y1="11" x2="26" y2="11" stroke="var(--status-weak)" strokeWidth="4" />
      </Swatch>
      {m.legend_line_bottleneck()}
    </span>
    <span className="flex items-center gap-2.5">
      <Swatch>
        <line
          x1="0"
          y1="11"
          x2="26"
          y2="11"
          stroke="var(--status-offline)"
          strokeWidth="2"
          strokeDasharray="4 4"
        />
      </Swatch>
      {m.legend_line_offline()}
    </span>
    <span className="flex items-center gap-2.5">
      <Swatch>
        <line x1="0" y1="11" x2="26" y2="11" stroke="var(--chart-axis)" strokeWidth="1.5" />
        {[4, 13, 22].map((x) => (
          <circle key={x} cx={x} cy="11" r="1.8" fill="var(--foreground-subtle)" />
        ))}
      </Swatch>
      {m.legend_flow()}
    </span>
    <span className="text-xs text-foreground-subtle">{m.legend_link_values()}</span>
  </Card>
)
