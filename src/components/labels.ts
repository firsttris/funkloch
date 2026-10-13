// Localized names and colours for the values the core uses; the texts shared with the server
// (notifications) live in src/lib/texts.ts.
import type { Status, Trend } from '~/core/types'
import { m } from '~/paraglide/messages.js'

export { eventDetail, eventTitle, kindLabel, roleLabel } from '~/lib/texts'

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

export const KIND_TONE: Record<string, string> = {
  offline: 'bg-track text-foreground',
  signal: 'bg-weak-bg text-weak',
  topology: 'bg-thread-bg text-thread',
  network: 'bg-track text-foreground-muted',
}

export const eventColor = (event: { kind: string; type: string }) =>
  event.type === 'offline'
    ? 'bg-offline'
    : event.kind === 'signal' && event.type !== 'signal_recovered'
      ? 'bg-weak'
      : 'bg-foreground'
