// Which events become notifications, and when: pure decisions over an event, the rules and what
// was sent before.
import type { Settings } from './settings'
import { HOUR, MINUTE } from './types'

export type Decision = 'send' | 'skip' | 'wait'

export type PendingEvent = {
  id: number
  ts: number
  type: string
  deviceId: number | null
  /** The device is online now; null for events without a device */
  deviceOnline: boolean | null
}

export type History = {
  /** `${type}:${deviceId}` → time of the last sent notification */
  lastSent: ReadonlyMap<string, number>
  /** Devices whose latest offline event was sent */
  offlineSent: ReadonlySet<number>
  /** Devices whose latest weak-signal event was sent */
  weakSent: ReadonlySet<number>
  /** Devices whose latest transmit-error event was sent */
  txErrorsSent: ReadonlySet<number>
}

type RuleKey = keyof Settings['rules']

const RULE: Record<string, RuleKey> = {
  offline: 'offline',
  online: 'offline',
  signal_weak: 'signal',
  signal_recovered: 'signal',
  trend_down: 'trend',
  pattern: 'pattern',
  tx_errors_high: 'transmit',
  tx_errors_normal: 'transmit',
  parent_changed: 'topology',
  role_changed: 'topology',
  device_added: 'network',
  device_removed: 'network',
  bridge_offline: 'network',
  bridge_online: 'network',
  channel_busy: 'network',
}

/** The same event of the same device is sent at most once in this time */
export const DEDUPE_WINDOW = HOUR
/** Older events are not sent any more (after a restart, or when a channel is set up later) */
export const MAX_AGE = 6 * HOUR

export const dedupeKey = (event: { type: string; deviceId: number | null }) =>
  `${event.type}:${event.deviceId ?? '-'}`

export const decide = (
  event: PendingEvent,
  rules: Settings['rules'],
  history: History,
  now: number,
): Decision => {
  const key = RULE[event.type]
  if (!key || !rules[key].enabled) return 'skip'
  const offlineWait = rules.offline.minutes * MINUTE
  if (now - event.ts > Math.max(MAX_AGE, offlineWait + HOUR)) return 'skip'

  if (event.type === 'offline') {
    // Back online before the wait was over: not worth a message
    if (event.deviceOnline === true) return 'skip'
    if (now - event.ts < offlineWait) return 'wait'
  }
  if (
    event.type === 'online' &&
    (event.deviceId === null || !history.offlineSent.has(event.deviceId))
  )
    return 'skip'
  if (
    event.type === 'signal_recovered' &&
    (event.deviceId === null || !history.weakSent.has(event.deviceId))
  )
    return 'skip'
  if (
    event.type === 'tx_errors_normal' &&
    (event.deviceId === null || !history.txErrorsSent.has(event.deviceId))
  )
    return 'skip'

  const last = history.lastSent.get(dedupeKey(event))
  if (last !== undefined && event.ts - last < DEDUPE_WINDOW) return 'skip'
  return 'send'
}

/** At least one channel is set up */
export const hasChannel = (channels: Settings['channels']) =>
  (channels.ntfy.server !== '' && channels.ntfy.topic !== '') ||
  channels.webhook.url !== '' ||
  channels.mqtt.enabled
