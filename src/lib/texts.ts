// Texts for roles and events, shared by the pages and the notifications. The pages use the
// request's language; the notifications pass the one from the settings.
import type { RouterFinding } from '~/core/router-finding'
import type { Role } from '~/core/types'
import { m } from '~/paraglide/messages.js'
import { getLocale, type Locale } from '~/paraglide/runtime.js'

type Options = { locale?: Locale }

const ROLES: Record<Role, (inputs: object, options?: Options) => string> = {
  coordinator: m.role_coordinator,
  border_router: m.role_border_router,
  access_point: m.role_access_point,
  router: m.role_router,
  router_eligible: m.role_router_eligible,
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
  tx_errors_high: m.event_tx_errors_high,
  tx_errors_normal: m.event_tx_errors_normal,
}

export const eventTitle = (event: EventLike, locale?: Locale) =>
  TITLES[event.type]?.({}, { locale }) ?? m.event_other({ type: event.type }, { locale })

const text = (value: string | number | boolean | null | undefined) =>
  value === null || value === undefined ? '–' : String(value)

/** A number in the language of the text, e.g. "9,7" or "13.700" */
const localNumber = (value: string | number | boolean | null | undefined, locale?: Locale) =>
  typeof value === 'number'
    ? new Intl.NumberFormat(locale ?? getLocale(), { maximumFractionDigits: 1 }).format(value)
    : text(value)

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
    case 'tx_errors_high':
    case 'tx_errors_normal':
      return (
        event.type === 'tx_errors_high'
          ? m.event_tx_errors_high_detail
          : m.event_tx_errors_normal_detail
      )(
        {
          rate: localNumber(d.rate, locale),
          frames: localNumber(d.frames, locale),
          threshold: localNumber(d.threshold, locale),
        },
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

type Finding = Omit<RouterFinding, 'uplink'> & {
  uplink: (NonNullable<RouterFinding['uplink']> & { text: string }) | null
}

const names = (list: readonly string[], locale?: Locale) =>
  new Intl.ListFormat(locale ?? getLocale(), { type: 'conjunction' }).format(list)

/** The finding on a router as sentences: who uses it, who covers its area, its way, the advice */
export const findingSentences = (finding: Finding, locale?: Locale) => {
  const o = { locale }
  const border = finding.root?.role === 'border_router'
  const way = (border ? m.finding_way_border_router : m.finding_way_coordinator)({}, o)
  const root = (border ? m.finding_root_border_router : m.finding_root_coordinator)({}, o)
  const { uplink, coveredBy } = finding
  const usage =
    finding.carried === 0
      ? m.finding_unused({}, o)
      : finding.carried === 1
        ? m.finding_carries_one({ way }, o)
        : m.finding_carries({ count: finding.carried, direct: finding.children, way }, o)
  const one = coveredBy.length === 1
  const coverText = coveredBy.every((r) => r.neighbor)
    ? one
      ? m.finding_covered_neighbor
      : m.finding_covered_neighbors
    : one
      ? m.finding_covered_other
      : m.finding_covered_others
  const covered =
    coveredBy.length === 0
      ? null
      : coverText(
          {
            names: names(
              coveredBy.map((r) => r.name),
              locale,
            ),
          },
          o,
        )
  const link = uplink
    ? uplink.root
      ? uplink.text
      : m.finding_link_via({ value: uplink.text, name: uplink.name }, o)
    : null
  const path =
    uplink && link
      ? (uplink.weak ? m.finding_uplink_weak : m.finding_uplink_fine)({ way, link }, o)
      : m.finding_no_uplink({ way }, o)
  const advice =
    finding.advice === 'move_towards_root'
      ? m.finding_move({ root }, o)
      : finding.advice === 'strengthen_uplink'
        ? m.finding_strengthen({ root }, o)
        : finding.advice === 'reserve'
          ? m.finding_reserve({}, o)
          : null
  return [usage, covered, path, advice].flatMap((sentence) => (sentence === null ? [] : [sentence]))
}
