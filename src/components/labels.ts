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

export const eventTitle = (event: EventLike) => {
  switch (event.type) {
    case 'offline':
      return m.event_offline()
    case 'online':
      return m.event_online()
    case 'device_added':
      return m.event_device_added()
    case 'device_removed':
      return m.event_device_removed()
    case 'bridge_online':
      return m.event_bridge_online()
    case 'bridge_offline':
      return m.event_bridge_offline()
    default:
      return m.event_other({ type: event.type })
  }
}

export const eventDetail = (event: EventLike) => {
  if (event.type !== 'offline') return ''
  return event.details.reason === 'reported' ? m.event_offline_reported() : m.event_offline_silent()
}

export const eventColor = (event: EventLike) =>
  event.type === 'offline' ? 'bg-offline' : event.kind === 'signal' ? 'bg-weak' : 'bg-foreground'
