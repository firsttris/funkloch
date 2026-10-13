// Localized names for the values the core uses.
import type { Role, Status, Trend } from '~/core/types'
import { m } from '~/paraglide/messages.js'

export const statusLabel = (status: Status) =>
  ({
    good: m.status_good,
    mid: m.status_mid,
    weak: m.status_weak,
    offline: m.status_offline,
    unknown: m.status_unknown,
  })[status]()

export const trendLabel = (trend: Trend) =>
  ({ down: m.trend_down, flat: m.trend_flat, up: m.trend_up, none: m.trend_none })[trend]()

export const roleLabel = (role: Role) =>
  ({
    coordinator: m.role_coordinator,
    border_router: m.role_border_router,
    router: m.role_router,
    end_device: m.role_end_device,
    sleepy_end_device: m.role_sleepy_end_device,
    unknown: m.role_unknown,
  })[role]?.() ?? role

export const powerLabel = (power: string) =>
  power === 'battery' ? m.power_battery() : power === 'mains' ? m.power_mains() : m.power_unknown()

export const statusColor: Record<Status, string> = {
  good: 'text-good',
  mid: 'text-mid',
  weak: 'text-weak',
  offline: 'text-offline',
  unknown: 'text-unknown',
}

export const statusBg: Record<Status, string> = {
  good: 'bg-good',
  mid: 'bg-mid',
  weak: 'bg-weak',
  offline: 'bg-offline',
  unknown: 'bg-unknown',
}

/** The stroke of a sparkline, as a CSS variable so it follows light and dark */
export const statusVar: Record<Status, string> = {
  good: 'var(--status-good)',
  mid: 'var(--status-mid)',
  weak: 'var(--status-weak)',
  offline: 'var(--status-offline)',
  unknown: 'var(--status-unknown)',
}

export const trendColor: Record<Trend, string> = {
  down: 'text-weak',
  flat: 'text-foreground-subtle',
  up: 'text-good',
  none: 'text-offline',
}

type EventLike = {
  kind: string
  type: string
  details: Record<string, string | number | boolean | null>
}

const TITLES: Record<string, () => string> = {
  offline: m.event_offline,
  online: m.event_online,
  device_added: m.event_device_added,
  device_removed: m.event_device_removed,
  bridge_online: m.event_bridge_online,
  bridge_offline: m.event_bridge_offline,
  signal_weak: m.event_signal_weak,
  signal_recovered: m.event_signal_recovered,
  trend_down: m.event_trend_down,
  parent_changed: m.event_parent_changed,
  role_changed: m.event_role_changed,
  pattern: m.event_pattern,
}

export const eventTitle = (event: EventLike) =>
  TITLES[event.type]?.() ?? m.event_other({ type: event.type })

const text = (value: string | number | boolean | null | undefined) =>
  value === null || value === undefined ? '–' : String(value)

/** The localized line after the title, from the event's details */
export const eventDetail = (event: EventLike) => {
  const d = event.details
  switch (event.type) {
    case 'offline':
      return d.reason === 'reported' ? m.event_offline_reported() : m.event_offline_silent()
    case 'signal_weak':
      return m.event_signal_weak_detail({
        value: text(d.value),
        threshold: text(d.threshold),
        minutes: text(d.minutes),
      })
    case 'signal_recovered':
      return m.event_signal_recovered_detail({ value: text(d.value) })
    case 'trend_down':
      return m.event_trend_down_detail({ change: text(d.change).replace('-', '−') })
    case 'parent_changed':
      return m.event_change_detail({ from: text(d.from), to: text(d.to) })
    case 'role_changed':
      return m.event_change_detail({
        from: roleLabel(text(d.from) as Role),
        to: roleLabel(text(d.to) as Role),
      })
    case 'device_added':
      return d.role ? roleLabel(d.role as Role) : ''
    case 'pattern':
      return m.event_pattern_detail({ days: text(d.days), from: text(d.from), to: text(d.to) })
    default:
      return ''
  }
}

export const KIND_TONE: Record<string, string> = {
  offline: 'bg-track text-foreground',
  signal: 'bg-weak-bg text-weak',
  topology: 'bg-thread-bg text-thread',
  network: 'bg-track text-foreground-muted',
}

const KINDS: Record<string, () => string> = {
  offline: m.kind_offline,
  signal: m.kind_signal,
  topology: m.kind_topology,
  network: m.kind_network,
}

export const kindLabel = (kind: string) => KINDS[kind]?.() ?? kind

export const eventColor = (event: EventLike) =>
  event.type === 'offline'
    ? 'bg-offline'
    : event.kind === 'signal' && event.type !== 'signal_recovered'
      ? 'bg-weak'
      : 'bg-foreground'
