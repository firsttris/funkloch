// The network map as a tree (core/map-tree.ts) on a canvas to drag and zoom: the coordinator or
// border router on top, routers below, each router's end devices as a list under it. Pointing at
// a device lights up its way to the root; search and "problems only" let the rest step back.
import { Maximize, Minus, Plus, Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import { mapTree } from '~/core/map-tree'
import { wayToRoot } from '~/core/topology'
import { cn } from '~/lib/cn'
import { number } from '~/lib/format'
import { m } from '~/paraglide/messages.js'
import { statusLabel } from './labels'
import {
  appearDelay,
  type MapDevice,
  MapDeviceMark,
  type MapLink,
  SignalBars,
} from './network-tree-parts'
import { usePanZoom } from './use-pan-zoom'

/** Days the snapshot slider reaches back; the server keeps the same number (views/network.ts) */
export const SNAPSHOT_DAYS_CLIENT = 7

const isProblem = (d: MapDevice) => d.status === 'weak' || d.status === 'offline'

const controlClass =
  'flex h-[34px] items-center gap-1.5 rounded-[10px] border border-border bg-surface px-2.5 text-[13px] font-semibold text-foreground hover:border-foreground-subtle'

export const NetworkTree = ({
  nodes,
  edges,
  selectedId,
  label,
  onSelect,
}: {
  nodes: MapDevice[]
  edges: MapLink[]
  selectedId: number | null
  label: string
  onSelect: (id: number) => void
}) => {
  const [opened, setOpened] = useState<ReadonlySet<number>>(new Set())
  const [hovered, setHovered] = useState<number | null>(null)
  const [query, setQuery] = useState('')
  const [problemsOnly, setProblemsOnly] = useState(false)

  const byId = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes])
  const uplink = useMemo(() => new Map(edges.filter((e) => e.parent).map((e) => [e.a, e])), [edges])
  const needle = query.trim().toLowerCase()
  const matches = (d: MapDevice) =>
    (!needle || d.name.toLowerCase().includes(needle)) && (!problemsOnly || isProblem(d))
  const filtering = needle !== '' || problemsOnly
  // A hit in a folded list opens it
  const unfolded = useMemo(() => {
    if (!needle) return opened
    const hits = nodes.filter((n) => n.name.toLowerCase().includes(needle))
    return new Set([...opened, ...hits.flatMap((n) => uplink.get(n.id)?.b ?? [])])
  }, [opened, needle, nodes, uplink])
  const tree = useMemo(() => mapTree(nodes, edges, unfolded), [nodes, edges, unfolded])
  const placedAt = useMemo(() => new Map(tree.placed.map((p) => [p.id, p])), [tree])
  const zoom = usePanZoom(tree)

  const focus = hovered ?? selectedId
  const way = focus === null ? null : new Set(wayToRoot(focus, edges))
  const children = (id: number) => edges.filter((e) => e.parent && e.b === id).map((e) => e.a)
  const kept = (id: number) => {
    const d = byId.get(id)
    if (!d || d.root) return true
    if (way) return way.has(id)
    if (!filtering) return true
    return matches(d) || children(id).some((c) => matches(byId.get(c) as MapDevice))
  }
  const counts = (id: number) => edges.filter((e) => e.parent && e.b === id).length

  const sub = (d: MapDevice) => {
    if (d.root) return m.network_devices({ count: number(nodes.length - 1) })
    if (d.status === 'offline') return statusLabel('offline')
    const up = uplink.get(d.id)
    return (
      <>
        {up ? <SignalBars bars={up.bars} quality={up.quality} /> : null}
        {up?.label ? <span className="font-mono">{up.label}</span> : null}
        {d.role === 'router' && counts(d.id) > 0 ? (
          <span>· {m.network_linked({ count: number(counts(d.id)) })}</span>
        ) : null}
      </>
    )
  }

  return (
    <section
      ref={zoom.frame}
      {...zoom.handlers}
      className={cn(
        'topo-frame relative h-[min(76vh,780px)] min-h-[440px] overflow-hidden rounded-lg',
        zoom.dragging && 'dragging',
      )}
      aria-label={label}
    >
      <div
        className={cn('topo-world absolute top-0 left-0', zoom.gliding && 'gliding')}
        style={{
          width: tree.width,
          height: tree.height,
          transform: zoom.view
            ? `translate(${zoom.view.x}px, ${zoom.view.y}px) scale(${zoom.view.k})`
            : undefined,
          visibility: zoom.view ? 'visible' : 'hidden',
        }}
      >
        <svg
          width={tree.width}
          height={tree.height}
          className="pointer-events-none absolute top-0 left-0 overflow-visible"
          aria-hidden="true"
        >
          {tree.lines.map((line) => {
            const lit = way?.has(line.id) ?? false
            const faded = !kept(line.id)
            const tone = cn(line.quality === 'weak' && 'weak', lit && 'lit', faded && 'topo-faded')
            const offline = line.quality === 'offline'
            return (
              <g
                key={line.id}
                style={appearDelay(placedAt.get(line.id) ?? { ...line, kind: 'client' })}
              >
                <path
                  d={line.d}
                  pathLength={offline ? undefined : 1}
                  className={cn('topo-line', offline ? 'offline' : 'topo-draw', tone)}
                />
                {offline ? null : (
                  <path
                    d={line.d}
                    className={cn('topo-flow', tone)}
                    style={{ animationDelay: `${-((line.id * 0.37) % 1)}s` }}
                  />
                )}
              </g>
            )
          })}
        </svg>
        {tree.placed.map((p) => {
          const device = byId.get(p.id)
          if (!device) return null
          return (
            <MapDeviceMark
              key={p.id}
              device={device}
              placed={p}
              sub={sub(device)}
              selected={p.id === selectedId}
              faded={!kept(p.id)}
              onSelect={onSelect}
              onHover={setHovered}
            />
          )
        })}
        {tree.folded.map((f) => (
          <button
            key={f.parent}
            type="button"
            data-topo-control
            onClick={() => setOpened(new Set([...opened, f.parent]))}
            className="topo-more absolute flex h-[30px] cursor-pointer items-center gap-2 rounded-full border border-border bg-surface px-3 text-xs font-semibold text-foreground-muted hover:border-foreground-subtle hover:text-foreground"
            style={{ left: f.x, top: f.y, ...appearDelay({ depth: 1, order: 6, kind: 'client' }) }}
          >
            {m.network_more({ count: number(f.hidden.length) })}
            <span className="flex gap-1" aria-hidden="true">
              {f.hidden.map((id) => (
                <i
                  key={id}
                  className="size-1.5 rounded-full"
                  style={{ background: `var(--status-${byId.get(id)?.status ?? 'unknown'})` }}
                />
              ))}
            </span>
          </button>
        ))}
        {tree.loose ? (
          <span
            className="absolute text-xs font-semibold text-foreground-subtle"
            style={{ left: tree.loose.x, top: tree.loose.y }}
          >
            {m.network_loose()}
          </span>
        ) : null}
      </div>

      <div data-topo-control className="absolute top-3 left-3 flex flex-wrap gap-1.5">
        <label className={cn(controlClass, 'w-[240px] max-w-[calc(100vw-96px)] font-medium')}>
          <Search size={15} className="shrink-0 text-foreground-subtle" aria-hidden="true" />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={m.network_search()}
            aria-label={m.network_search()}
            className="w-full min-w-0 border-0 bg-transparent outline-none"
          />
        </label>
        <button
          type="button"
          aria-pressed={problemsOnly}
          onClick={() => setProblemsOnly(!problemsOnly)}
          className={cn(controlClass, 'cursor-pointer', problemsOnly && 'border-foreground')}
        >
          <i className="size-[7px] rounded-full bg-weak" aria-hidden="true" />
          {m.network_problems()}
        </button>
      </div>
      <div data-topo-control className="absolute right-3 bottom-3 flex gap-1.5">
        <button
          type="button"
          onClick={zoom.zoomOut}
          aria-label={m.network_zoom_out()}
          className={cn(controlClass, 'cursor-pointer')}
        >
          <Minus size={15} aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={zoom.zoomIn}
          aria-label={m.network_zoom_in()}
          className={cn(controlClass, 'cursor-pointer')}
        >
          <Plus size={15} aria-hidden="true" />
        </button>
        <button type="button" onClick={zoom.fit} className={cn(controlClass, 'cursor-pointer')}>
          <Maximize size={14} aria-hidden="true" />
          {m.network_fit()}
        </button>
      </div>
    </section>
  )
}
