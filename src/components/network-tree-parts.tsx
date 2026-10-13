// The pieces of the network map: a device's tile with its icon and status dot, the text beside
// it, and signal bars as a phone shows reception. Looks and motion live in styles.css (.topo-*).
import { Link } from '@tanstack/react-router'
import {
  AlarmSmoke,
  Blinds,
  Cpu,
  DoorOpen,
  Droplets,
  Lightbulb,
  type LucideIcon,
  PersonStanding,
  Plug,
  RadioTower,
  Router,
  Thermometer,
  ToggleLeft,
} from 'lucide-react'
import type { CSSProperties, ReactNode } from 'react'
import type { DeviceKind } from '~/core/device-kind'
import type { Placed } from '~/core/map-tree'
import type { Band, Role, Status } from '~/core/types'
import { cn } from '~/lib/cn'
import { roleLabel, statusVar } from './labels'

export const KIND_ICON: Record<DeviceKind, LucideIcon> = {
  root: RadioTower,
  router: Router,
  plug: Plug,
  smoke: AlarmSmoke,
  switch: ToggleLeft,
  motion: PersonStanding,
  contact: DoorOpen,
  climate: Thermometer,
  water: Droplets,
  light: Lightbulb,
  blind: Blinds,
  device: Cpu,
}

export type MapDevice = {
  id: number
  name: string
  role: Role
  status: Status
  root: boolean
  kind: DeviceKind
}

export type MapLink = {
  a: number
  b: number
  parent: boolean
  quality: Band | 'offline' | null
  label: string
  bars: number
}

/** Delay of the build-up animation: each level a little later, a list one row after the other */
export const appearDelay = (p: Pick<Placed, 'depth' | 'order' | 'kind'>) =>
  ({
    '--topo-delay': `${p.kind === 'client' ? p.depth * 170 - 60 + p.order * 45 : p.depth * 170}ms`,
  }) as CSSProperties

export const SignalBars = ({ bars, quality }: { bars: number; quality: MapLink['quality'] }) => (
  <span className="inline-flex h-2.5 items-end gap-[1.5px]" aria-hidden="true">
    {[1, 2, 3, 4].map((i) => (
      <i
        key={i}
        className="block w-[2.5px] rounded-[1px]"
        style={{
          height: `${i * 2.5}px`,
          background:
            i <= bars && quality && quality !== 'offline'
              ? statusVar[quality]
              : 'var(--chart-grid)',
        }}
      />
    ))}
  </span>
)

/** The tile: the icon, a status dot (beating when weak), radio waves for the root */
const Tile = ({ device, size }: { device: MapDevice; size: number }) => {
  const Icon = KIND_ICON[device.kind]
  const dot = size > 40 ? 12 : 9
  return (
    <span
      className="topo-tile relative grid shrink-0 place-items-center text-foreground-muted"
      style={{ width: size, height: size, borderRadius: size > 60 ? 18 : size > 40 ? 14 : 10 }}
    >
      {device.root
        ? [0, 1.2, 2.4].map((delay) => (
            <span
              key={delay}
              className="topo-wave pointer-events-none absolute inset-0 rounded-[inherit]"
              style={{ animationDelay: `${delay}s` }}
            />
          ))
        : null}
      <Icon size={Math.round(size * 0.46)} strokeWidth={1.6} aria-hidden="true" />
      {device.root ? null : (
        <span
          className={cn(
            'absolute rounded-full border-surface-muted',
            device.status === 'weak' && 'topo-beat',
          )}
          style={{
            width: dot,
            height: dot,
            right: -3,
            top: -3,
            borderWidth: size > 40 ? 2.5 : 2,
            background: statusVar[device.status],
          }}
        />
      )}
    </span>
  )
}

/** A device on the map: a link that selects it, its tile and the two lines of text beside it */
export const MapDeviceMark = ({
  device,
  placed,
  sub,
  selected,
  faded,
  onSelect,
  onHover,
}: {
  device: MapDevice
  placed: Placed
  sub: ReactNode
  selected: boolean
  faded: boolean
  onSelect: (id: number) => void
  onHover: (id: number | null) => void
}) => (
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
    className={cn(
      'topo-device absolute flex items-center no-underline focus-visible:outline-none',
      placed.kind === 'client' ? 'gap-2.5' : 'gap-3',
      device.root && 'topo-root',
      device.status === 'offline' && 'topo-offline',
      selected && 'selected',
      faded && 'topo-faded',
    )}
    style={{ left: placed.x, top: placed.y, ...appearDelay(placed) }}
  >
    <Tile device={device} size={placed.tile} />
    <span className="topo-label grid min-w-0 leading-tight">
      <b
        className={cn(
          'font-semibold whitespace-nowrap',
          device.root ? 'text-[15px]' : placed.kind === 'client' ? 'text-[12.5px]' : 'text-[13px]',
          device.status === 'weak' && placed.kind === 'client' ? 'text-weak' : 'text-foreground',
          device.status === 'offline' && 'text-foreground-subtle',
        )}
      >
        {device.name}
      </b>
      <span className="flex items-center gap-1.5 text-[11.5px] whitespace-nowrap text-foreground-subtle">
        {sub}
      </span>
    </span>
  </Link>
)
