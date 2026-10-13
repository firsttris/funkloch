import { queryOptions, useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute, Link, stripSearchParams, useNavigate } from '@tanstack/react-router'
import { z } from 'zod'
import { AppHeader } from '~/components/app-header'
import { roleLabel, statusLabel } from '~/components/labels'
import { NetworkGraph, SNAPSHOT_DAYS_CLIENT } from '~/components/network-graph'
import { StatusDot } from '~/components/status'
import { Badge } from '~/components/ui/badge'
import { Card, CardTitle } from '~/components/ui/card'
import { Segmented } from '~/components/ui/segmented'
import { dateTime, number } from '~/lib/format'
import { m } from '~/paraglide/messages.js'
import { getNetwork, requestTopology } from '~/server/fn/pages'

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

        <div className="flex flex-wrap items-start gap-4">
          <Card className="min-w-0 flex-[999_1_640px] p-3">
            {data.edges.length === 0 && data.nodes.length <= 1 ? (
              <p className="px-3 py-16 text-center text-foreground-subtle">{m.network_empty()}</p>
            ) : (
              <NetworkGraph
                size={data.size}
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

const Line = ({ color, dash, width = 3 }: { color: string; dash?: string; width?: number }) => (
  <svg width="22" height="10" viewBox="0 0 22 10" aria-hidden="true">
    <line x1="0" y1="5" x2="22" y2="5" stroke={color} strokeWidth={width} strokeDasharray={dash} />
  </svg>
)

const Legend = () => (
  <Card className="flex flex-col gap-2.5 px-[18px] py-4 text-[13px] text-foreground-muted">
    <CardTitle className="text-sm">{m.legend_title()}</CardTitle>
    <span className="flex items-center gap-2.5">
      <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true">
        <rect x="2" y="2" width="18" height="18" rx="5" className="fill-primary" />
      </svg>
      {m.legend_root()}
    </span>
    <span className="flex items-center gap-2.5">
      <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true">
        <circle
          cx="11"
          cy="11"
          r="8.5"
          className="fill-surface stroke-foreground"
          strokeWidth="2"
        />
      </svg>
      {m.legend_router()}
    </span>
    <span className="flex items-center gap-2.5">
      <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true">
        <circle
          cx="11"
          cy="11"
          r="5.5"
          className="fill-surface stroke-foreground-subtle"
          strokeWidth="2"
        />
      </svg>
      {m.legend_end_device()}
    </span>
    <span className="flex items-center gap-2.5">
      <Line color="var(--status-good)" />
      {m.status_good()}
    </span>
    <span className="flex items-center gap-2.5">
      <Line color="var(--status-mid)" />
      {m.status_mid()}
    </span>
    <span className="flex items-center gap-2.5">
      <Line color="var(--status-weak)" />
      {m.status_weak()}
    </span>
    <span className="flex items-center gap-2.5">
      <Line color="var(--status-offline)" dash="5 4" />
      {m.status_offline()}
    </span>
    <span className="flex items-center gap-2.5">
      <Line color="var(--chart-grid)" width={2} />
      {m.legend_neighbor()}
    </span>
    <span className="text-xs text-foreground-subtle">{m.legend_link_values()}</span>
  </Card>
)
