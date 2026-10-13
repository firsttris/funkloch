import { DAY, MINUTE } from './types'

export const MIN_SILENCE = 30 * MINUTE
export const SILENCE_FACTOR = 3
export const INTERVAL_WINDOW = 7 * DAY

/**
 * The device's usual gap between two messages over the given timestamps (the last 7 days): the
 * gap a moment in that time typically falls into, i.e. the median of the gaps weighted by their
 * length. A plain median would follow the count of gaps, and a remote that sends bursts of
 * presses a second apart would get an interval of seconds and turn offline every evening.
 * Null when there are fewer than three messages to judge from.
 */
export const typicalInterval = (timestamps: readonly number[]): number | null => {
  if (timestamps.length < 3) return null
  const sorted = [...timestamps].sort((a, b) => a - b)
  const gaps = sorted
    .slice(1)
    .map((ts, i) => ts - (sorted[i] as number))
    .filter((gap) => gap > 0)
    .sort((a, b) => a - b)
  const half = gaps.reduce((sum, gap) => sum + gap, 0) / 2
  let covered = 0
  for (const gap of gaps) {
    covered += gap
    if (covered >= half) return gap
  }
  return null
}

/** How long a device may stay silent before it counts as offline; null: never by silence alone. */
export const silenceLimit = (interval: number | null): number | null =>
  interval === null ? null : Math.max(SILENCE_FACTOR * interval, MIN_SILENCE)

export type ReachabilityInput = {
  /** What the protocol itself reports; null when it does not report availability */
  reported: boolean | null
  lastSeen: number | null
  interval: number | null
  now: number
}

export type Reachability = { online: boolean; reason: 'reported' | 'silent' | 'seen' | 'unknown' }

/**
 * Offline when the protocol says so, or when the device has been silent for longer than three
 * times its usual interval (at least 30 min). A device without enough history is only judged by
 * what the protocol reports, which avoids alarms for devices that report once a day.
 */
export const reachability = ({
  reported,
  lastSeen,
  interval,
  now,
}: ReachabilityInput): Reachability => {
  if (reported === false) return { online: false, reason: 'reported' }
  const limit = silenceLimit(interval)
  if (lastSeen !== null && limit !== null && now - lastSeen > limit) {
    return { online: false, reason: 'silent' }
  }
  if (reported === true) return { online: true, reason: 'reported' }
  return lastSeen === null ? { online: false, reason: 'unknown' } : { online: true, reason: 'seen' }
}

/** Minutes within [start, end) during which the device was offline, from its state changes. */
export const offlineMinutes = (
  changes: readonly { ts: number; online: boolean }[],
  onlineAtStart: boolean,
  start: number,
  end: number,
): number => {
  const sorted = changes.filter((c) => c.ts >= start && c.ts < end).sort((a, b) => a.ts - b.ts)
  let online = onlineAtStart
  let since = start
  let offline = 0
  for (const change of sorted) {
    if (!online) offline += change.ts - since
    online = change.online
    since = change.ts
  }
  if (!online) offline += end - since
  return Math.round(offline / MINUTE)
}
