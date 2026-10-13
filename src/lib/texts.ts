// Texts for roles and events, shared by the pages and the notifications. The pages use the
// request's language; the notifications pass the one from the settings.
import type { Role } from '~/core/types'
import { m } from '~/paraglide/messages.js'
import type { Locale } from '~/paraglide/runtime.js'

type Options = { locale?: Locale }

const ROLES: Record<Role, (inputs: object, options?: Options) => string> = {
  coordinator: m.role_coordinator,
  border_router: m.role_border_router,
  router: m.role_router,
  end_device: m.role_end_device,
  sleepy_end_device: m.role_sleepy_end_device,
  unknown: m.role_unknown,
}

export const roleLabel = (role: Role, locale?: Locale) => ROLES[role]?.({}, { locale }) ?? role

export type EventLike = {
  kind: string
  type: string
  details: Record<string, string | number | boolean | null>
}

const TITLES: Record<string, (inputs: object, options?: Options) => string> = {
  offline: m.event_offline,
  online: m.event_online,
  device_added: m.event_device_added,
  device_removed: m.event_device_removed,
  bridge_online: m.event_bridge_online,
  bridge_offline: m.event_bridge_offline,
  channel_busy: m.event_channel_busy,
  signal_weak: m.event_signal_weak,
  signal_recovered: m.event_signal_recovered,
  trend_down: m.event_trend_down,
  parent_changed: m.event_parent_changed,
  role_changed: m.event_role_changed,
  pattern: m.event_pattern,
}

export const eventTitle = (event: EventLike, locale?: Locale) =>
  TITLES[event.type]?.({}, { locale }) ?? m.event_other({ type: event.type }, { locale })

const text = (value: string | number | boolean | null | undefined) =>
  value === null || value === undefined ? '–' : String(value)

/** The line after the title, from the event's details */
export const eventDetail = (event: EventLike, locale?: Locale) => {
  const d = event.details
  const o = { locale }
  switch (event.type) {
    case 'offline':
      return d.reason === 'reported'
        ? m.event_offline_reported({}, o)
        : m.event_offline_silent({}, o)
    case 'signal_weak':
      return m.event_signal_weak_detail(
        { value: text(d.value), threshold: text(d.threshold), minutes: text(d.minutes) },
        o,
      )
    case 'signal_recovered':
      return m.event_signal_recovered_detail({ value: text(d.value) }, o)
    case 'trend_down':
      return m.event_trend_down_detail({ change: text(d.change).replace('-', '−') }, o)
    case 'parent_changed':
      return m.event_change_detail({ from: text(d.from), to: text(d.to) }, o)
    case 'role_changed':
      return m.event_change_detail(
        {
          from: roleLabel(text(d.from) as Role, locale),
          to: roleLabel(text(d.to) as Role, locale),
        },
        o,
      )
    case 'device_added':
      return d.role ? roleLabel(d.role as Role, locale) : ''
    case 'channel_busy':
      return m.event_channel_busy_detail(
        { channel: text(d.channel), energy: text(d.energy).replace('-', '−') },
        o,
      )
    case 'pattern':
      return m.event_pattern_detail({ days: text(d.days), from: text(d.from), to: text(d.to) }, o)
    default:
      return ''
  }
}

const KINDS: Record<string, (inputs: object, options?: Options) => string> = {
  offline: m.kind_offline,
  signal: m.kind_signal,
  topology: m.kind_topology,
  network: m.kind_network,
}

export const kindLabel = (kind: string, locale?: Locale) => KINDS[kind]?.({}, { locale }) ?? kind
