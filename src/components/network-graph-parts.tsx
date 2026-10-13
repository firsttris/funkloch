// The pieces of the network map: lines, the values on them and devices. Looks and motion live in
// styles.css (.map-*); the inline delays let the map build up from the root outwards.
import { Link } from '@tanstack/react-router'
import type { CSSProperties } from 'react'
import { EDGE_LABEL_HEIGHT, edgeLabelWidth } from '~/core/edge-labels'
import { nodeRadius, ROLE_LINE } from '~/core/map-layout'
import type { Band, Role, Status } from '~/core/types'
import { cn } from '~/lib/cn'
import { roleLabel } from './labels'

export type MapDeviceData = {
  id: number
  name: string
  role: Role
  status: Status
  x: number
  y: number
  root: boolean
}

export type MapLineData = {
  a: number
  b: number
  parent: boolean
  quality: Band | 'offline' | null
  label: string
  /** Where the value sits on the line (core/edge-labels.ts); null for neighbor lines */
  labelAt: { x: number; y: number } | null
}

const LINE_COLOR: Record<Band | 'offline', string> = {
  good: 'var(--status-good)',
  mid: 'var(--status-mid)',
  weak: 'var(--status-weak)',
  offline: 'var(--status-offline)',
}

/** Delay of the build-up animation for something this many hops from the root */
export const appearDelay = (hops: number) =>
  ({
    '--map-delay': `${Math.min(hops, 6) * 110}ms`,
  }) as CSSProperties

const lineColor = (line: MapLineData) =>
  line.parent && line.quality ? LINE_COLOR[line.quality] : 'var(--chart-grid)'

/**
 * A line from a device (`from`) to its parent or neighbor (`to`). A parent line glows in the
 * colour of its quality and carries a dot that runs towards the parent, the way the data goes.
 */
export const MapLine = ({
  line,
  from,
  to,
  hops,
  dimmed,
  lit,
}: {
  line: MapLineData
  from: MapDeviceData
  to: MapDeviceData
  hops: number
  dimmed: boolean
  lit: boolean
}) => {
  const color = lineColor(line)
  const offline = line.quality === 'offline'
  const ends = { x1: from.x, y1: from.y, x2: to.x, y2: to.y }
  return (
    <g
      className={cn('map-line', dimmed && 'map-dimmed', lit && 'map-lit')}
      style={{ ...appearDelay(hops), color }}
    >
      {line.parent && !offline ? (
        <line {...ends} className="map-line-glow" stroke="currentColor" strokeWidth={9} />
      ) : null}
      <line
        {...ends}
        // The line draws itself on a length of 1; a dashed offline line only fades in
        pathLength={offline ? undefined : 1}
        className={cn('map-line-base', offline && 'map-line-offline')}
        strokeDasharray={offline ? '6 5' : undefined}
        stroke="currentColor"
        strokeWidth={line.parent ? 3 : 1.5}
        strokeLinecap="round"
      />
      {line.parent && !offline ? (
        <line
          {...ends}
          className={cn('map-line-flow', line.quality === 'weak' && 'map-line-flow-slow')}
          stroke="currentColor"
          strokeWidth={4}
          strokeLinecap="round"
        />
      ) : null}
    </g>
  )
}

/** The value of a parent line, in a small box on it */
export const MapLineLabel = ({
  line,
  hops,
  dimmed,
}: {
  line: MapLineData
  hops: number
  dimmed: boolean
}) => {
  if (!line.labelAt) return null
  const { x, y } = line.labelAt
  const w = edgeLabelWidth(line.label)
  const color = line.quality ? LINE_COLOR[line.quality] : 'var(--foreground-subtle)'
  return (
    <g className={cn('map-label', dimmed && 'map-dimmed')} style={appearDelay(hops + 1)}>
      <rect
        x={x - w / 2}
        y={y - EDGE_LABEL_HEIGHT / 2}
        width={w}
        height={EDGE_LABEL_HEIGHT}
        rx={EDGE_LABEL_HEIGHT / 2}
        fill="var(--surface)"
        stroke={line.quality === 'weak' ? color : 'var(--border)'}
      />
      <text x={x} y={y + 4} fill={color}>
        {line.label}
      </text>
    </g>
  )
}

const strokeOf = (device: MapDeviceData) =>
  device.status === 'offline'
    ? 'var(--status-offline)'
    : device.status === 'weak'
      ? 'var(--status-weak)'
      : device.role === 'router'
        ? 'var(--foreground)'
        : 'var(--foreground-subtle)'

/** The coordinator or border router: a rounded square that sends radio waves */
const RootMark = ({ device, r }: { device: MapDeviceData; r: number }) => (
  <>
    {[0, 1, 2].map((wave) => (
      <circle
        key={wave}
        cx={device.x}
        cy={device.y}
        r={r}
        className="map-wave"
        style={{ animationDelay: `${wave}s` }}
      />
    ))}
    <rect
      x={device.x - r}
      y={device.y - r}
      width={2 * r}
      height={2 * r}
      rx={12}
      className="map-root fill-primary"
    />
  </>
)

/** A device: its mark, a halo for a weak one, the name and, for some roles, the role below */
export const MapDevice = ({
  device,
  hops,
  selected,
  dimmed,
  onSelect,
  onHover,
}: {
  device: MapDeviceData
  hops: number
  selected: boolean
  dimmed: boolean
  onSelect: (id: number) => void
  onHover: (id: number | null) => void
}) => {
  const r = nodeRadius(device.root ? 'coordinator' : device.role)
  const offline = device.status === 'offline'
  const weak = device.status === 'weak'
  return (
    <Link
      to="/network"
      search={(prev) => ({ ...prev, device: device.id })}
      replace
      resetScroll={false}
      onClick={(event) => {
        event.preventDefault()
        onSelect(device.id)
      }}
      onMouseEnter={() => onHover(device.id)}
      onMouseLeave={() => onHover(null)}
      onFocus={() => onHover(device.id)}
      onBlur={() => onHover(null)}
      aria-label={`${device.name}, ${roleLabel(device.role)}`}
      className={cn('map-device focus-visible:outline-none', dimmed && 'map-dimmed')}
      style={appearDelay(hops)}
    >
      {weak ? <circle cx={device.x} cy={device.y} r={r + 4} className="map-halo" /> : null}
      {selected ? (
        <circle
          cx={device.x}
          cy={device.y}
          r={r + 9}
          className="map-selected"
          stroke={weak ? 'var(--status-weak)' : 'var(--foreground)'}
        />
      ) : null}
      <circle cx={device.x} cy={device.y} r={r + 5} className="map-ring" />
      {device.root ? (
        <RootMark device={device} r={r} />
      ) : (
        <circle
          cx={device.x}
          cy={device.y}
          r={r}
          className="map-mark"
          fill={offline ? 'var(--track)' : 'var(--surface)'}
          stroke={strokeOf(device)}
          strokeWidth={device.role === 'router' ? 2.5 : 2}
          strokeDasharray={
            offline ? '4 3' : device.role === 'sleepy_end_device' ? '3 2' : undefined
          }
        />
      )}
      <text
        x={device.x}
        y={device.y + r + 18}
        textAnchor="middle"
        fontSize={device.root ? 14 : 13}
        fontWeight={selected ? 700 : 600}
        paintOrder="stroke"
        stroke="var(--surface)"
        strokeWidth={4}
        strokeLinejoin="round"
        className={cn(offline ? 'fill-offline' : weak ? 'fill-weak' : 'fill-foreground')}
      >
        {device.name}
      </text>
      {ROLE_LINE.includes(device.role) ? (
        <text
          x={device.x}
          y={device.y + r + 33}
          textAnchor="middle"
          fontSize={11}
          paintOrder="stroke"
          stroke="var(--surface)"
          strokeWidth={4}
          strokeLinejoin="round"
          className="fill-foreground-subtle"
        >
          {roleLabel(device.role)}
        </text>
      ) : null}
    </Link>
  )
}
