// The network map as SVG: positions and size come from the server (core/map-layout.ts), so the
// first render already shows the final picture. It builds up from the root outwards; pointing at
// a device lights up its way to the root and its lines while the rest steps back.
import { useEffect, useRef, useState } from 'react'
import { edgeKey, focusOf, hopsToRoot } from '~/core/topology'
import {
  MapDevice,
  type MapDeviceData,
  MapLine,
  type MapLineData,
  MapLineLabel,
} from './network-graph-parts'

/** Days the snapshot slider reaches back; the server keeps the same number (views/network.ts) */
export const SNAPSHOT_DAYS_CLIENT = 7

/** A large map shrinks to its card only this far; beyond that it scrolls, so names stay legible */
const MIN_SCALE = 0.8

/** Hops of every device to the root; devices without a way get one ring beyond the last */
const hopsOf = (nodes: readonly MapDeviceData[], edges: readonly MapLineData[]) => {
  const roots = new Set(nodes.filter((n) => n.root).map((n) => n.id))
  const known = new Map(nodes.map((n) => [n.id, hopsToRoot(n.id, edges, roots)]))
  const beyond = Math.max(0, ...[...known.values()].map((h) => h ?? 0)) + 1
  return (id: number) => known.get(id) ?? beyond
}

export const NetworkGraph = ({
  size,
  nodes,
  edges,
  selectedId,
  label,
  onSelect,
}: {
  size: { width: number; height: number }
  nodes: MapDeviceData[]
  edges: MapLineData[]
  selectedId: number | null
  label: string
  onSelect: (id: number) => void
}) => {
  const byId = new Map(nodes.map((n) => [n.id, n]))
  // Neighbor lines underneath, parent lines on top
  const ordered = [...edges].sort((a, b) => Number(a.parent) - Number(b.parent))
  const hops = hopsOf(nodes, edges)
  const [hovered, setHovered] = useState<number | null>(null)
  const focusId = hovered ?? selectedId
  const focus = focusId === null ? null : focusOf(focusId, edges)
  const dimNode = (id: number) => focus !== null && !focus.nodes.has(id)
  const dimLine = (line: MapLineData) => focus !== null && !focus.lines.has(edgeKey(line))

  const frame = useRef<HTMLDivElement>(null)
  // A map wider than its card opens with the root in view
  const rootX = nodes.find((n) => n.root)?.x ?? size.width / 2
  useEffect(() => {
    const element = frame.current
    if (!element) return
    element.scrollLeft = (rootX / size.width) * element.scrollWidth - element.clientWidth / 2
  }, [rootX, size.width])

  return (
    <div ref={frame} className="max-h-[80vh] overflow-auto">
      <svg
        viewBox={`0 0 ${size.width} ${size.height}`}
        className="map block h-auto w-full"
        style={{ minWidth: size.width * MIN_SCALE }}
        aria-label={label}
      >
        <title>{label}</title>
        <defs>
          <pattern id="map-dots" width="24" height="24" patternUnits="userSpaceOnUse">
            <circle cx="12" cy="12" r="1" className="map-dot" />
          </pattern>
        </defs>
        <rect width={size.width} height={size.height} fill="url(#map-dots)" />
        {ordered.map((line) => {
          const from = byId.get(line.a)
          const to = byId.get(line.b)
          if (!from || !to) return null
          return (
            <MapLine
              key={edgeKey(line)}
              line={line}
              from={from}
              to={to}
              hops={Math.min(hops(line.a), hops(line.b))}
              dimmed={dimLine(line)}
              lit={focus?.lines.has(edgeKey(line)) ?? false}
            />
          )
        })}
        <g className="font-mono" fontSize="12" fontWeight="600" textAnchor="middle">
          {ordered
            .filter((line) => line.parent)
            .map((line) => (
              <MapLineLabel
                key={`label-${edgeKey(line)}`}
                line={line}
                hops={hops(line.a)}
                dimmed={dimLine(line)}
              />
            ))}
        </g>
        {nodes.map((device) => (
          <MapDevice
            key={device.id}
            device={device}
            hops={hops(device.id)}
            selected={device.id === selectedId}
            dimmed={dimNode(device.id)}
            onSelect={onSelect}
            onHover={setHovered}
          />
        ))}
      </svg>
    </div>
  )
}
