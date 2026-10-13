// The network map as SVG: positions come from the server (d3-force), so the first render already
// shows the final picture. Every device is a link that selects it.
import { Link } from '@tanstack/react-router'
import type { Band, Role, Status } from '~/core/types'
import { cn } from '~/lib/cn'
import { roleLabel } from './labels'

/** Days the snapshot slider reaches back; the server keeps the same number (views/network.ts) */
export const SNAPSHOT_DAYS_CLIENT = 7

type Node = {
  id: number
  name: string
  role: Role
  status: Status
  x: number
  y: number
  root: boolean
}
type Edge = {
  a: number
  b: number
  parent: boolean
  quality: Band | 'offline' | null
  label: string
}

const EDGE_COLOR: Record<Band | 'offline', string> = {
  good: 'var(--status-good)',
  mid: 'var(--status-mid)',
  weak: 'var(--status-weak)',
  offline: 'var(--status-offline)',
}

const WIDTH = 900
const HEIGHT = 580

const radius = (node: Node) => (node.root ? 28 : node.role === 'router' ? 22 : 13)

export const NetworkGraph = ({
  nodes,
  edges,
  selectedId,
  label,
  onSelect,
}: {
  nodes: Node[]
  edges: Edge[]
  selectedId: number | null
  label: string
  onSelect: (id: number) => void
}) => {
  const byId = new Map(nodes.map((n) => [n.id, n]))
  // Neighbor lines underneath, parent lines on top
  const ordered = [...edges].sort((a, b) => Number(a.parent) - Number(b.parent))
  return (
    <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="block h-auto w-full" aria-label={label}>
      <title>{label}</title>
      {ordered.map((edge) => {
        const a = byId.get(edge.a)
        const b = byId.get(edge.b)
        if (!a || !b) return null
        const color = edge.parent && edge.quality ? EDGE_COLOR[edge.quality] : 'var(--chart-grid)'
        return (
          <line
            key={`${edge.a}-${edge.b}`}
            x1={a.x}
            y1={a.y}
            x2={b.x}
            y2={b.y}
            stroke={color}
            strokeWidth={edge.parent ? 3 : 1.5}
            strokeDasharray={edge.quality === 'offline' ? '6 5' : undefined}
          />
        )
      })}
      <g className="font-mono" fontSize="12" fontWeight="600" textAnchor="middle">
        {ordered
          .filter((edge) => edge.parent)
          .map((edge) => {
            const a = byId.get(edge.a)
            const b = byId.get(edge.b)
            if (!a || !b) return null
            const x = (a.x + b.x) / 2
            const y = (a.y + b.y) / 2
            const w = Math.max(30, edge.label.length * 7.5 + 12)
            const color = edge.quality ? EDGE_COLOR[edge.quality] : 'var(--foreground-subtle)'
            return (
              <g key={`label-${edge.a}-${edge.b}`}>
                <rect
                  x={x - w / 2}
                  y={y - 10}
                  width={w}
                  height={20}
                  rx={4}
                  fill="var(--surface)"
                  stroke={edge.quality === 'weak' ? color : 'var(--border)'}
                />
                <text x={x} y={y + 4} fill={color}>
                  {edge.label}
                </text>
              </g>
            )
          })}
      </g>
      {nodes.map((node) => {
        const selected = node.id === selectedId
        const r = radius(node)
        const offline = node.status === 'offline'
        const weak = node.status === 'weak'
        return (
          <Link
            key={node.id}
            to="/network"
            search={(prev) => ({ ...prev, device: node.id })}
            replace
            resetScroll={false}
            onClick={(event) => {
              event.preventDefault()
              onSelect(node.id)
            }}
            aria-label={`${node.name}, ${roleLabel(node.role)}`}
            className="cursor-pointer focus-visible:outline-none [&:focus-visible>.ring]:stroke-primary"
          >
            {selected ? (
              <circle
                cx={node.x}
                cy={node.y}
                r={r + 9}
                fill="none"
                stroke={weak ? 'var(--status-weak)' : 'var(--foreground)'}
                strokeWidth={2}
                strokeDasharray="4 4"
              />
            ) : null}
            <circle
              className="ring"
              cx={node.x}
              cy={node.y}
              r={r + 5}
              fill="transparent"
              stroke="transparent"
              strokeWidth={2}
            />
            {node.root ? (
              <rect
                x={node.x - r}
                y={node.y - r}
                width={2 * r}
                height={2 * r}
                rx={12}
                className="fill-primary"
              />
            ) : (
              <circle
                cx={node.x}
                cy={node.y}
                r={r}
                fill={offline ? 'var(--track)' : 'var(--surface)'}
                stroke={
                  offline
                    ? 'var(--status-offline)'
                    : weak
                      ? 'var(--status-weak)'
                      : node.role === 'router'
                        ? 'var(--foreground)'
                        : 'var(--foreground-subtle)'
                }
                strokeWidth={node.role === 'router' ? 2.5 : 2}
                strokeDasharray={
                  offline ? '4 3' : node.role === 'sleepy_end_device' ? '3 2' : undefined
                }
              />
            )}
            <text
              x={node.x}
              y={node.y + r + 18}
              textAnchor="middle"
              fontSize={node.root ? 14 : 13}
              fontWeight={selected ? 700 : 600}
              paintOrder="stroke"
              stroke="var(--surface)"
              strokeWidth={4}
              strokeLinejoin="round"
              className={cn(offline ? 'fill-offline' : weak ? 'fill-weak' : 'fill-foreground')}
            >
              {node.name}
            </text>
            {node.role === 'router' || node.role === 'sleepy_end_device' ? (
              <text
                x={node.x}
                y={node.y + r + 33}
                textAnchor="middle"
                fontSize={11}
                paintOrder="stroke"
                stroke="var(--surface)"
                strokeWidth={4}
                strokeLinejoin="round"
                className="fill-foreground-subtle"
              >
                {roleLabel(node.role)}
              </text>
            ) : null}
          </Link>
        )
      })}
    </svg>
  )
}
