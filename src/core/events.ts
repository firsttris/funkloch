// When something worth an event happens: pure transitions between states, so a state that
// stays the same never makes a second event.
import type { Thresholds } from './score'
import { median } from './stats'
import type { Trend } from './types'

export type EventKind = 'offline' | 'signal' | 'topology' | 'network'

/** Points above the weak threshold before a weak signal counts as recovered, against flapping */
export const SIGNAL_HYSTERESIS = 5

/**
 * The median score of the window (by default the last 30 minutes) against the weak threshold:
 * below it a strong signal turns weak, above threshold plus hysteresis a weak one recovers.
 * No samples in the window: no change.
 */
export const signalTransition = (
  weak: boolean,
  windowScores: readonly number[],
  thresholds: Thresholds,
): 'signal_weak' | 'signal_recovered' | null => {
  const value = median(windowScores)
  if (value === null) return null
  if (!weak && value < thresholds.weak) return 'signal_weak'
  if (weak && value >= thresholds.weak + SIGNAL_HYSTERESIS) return 'signal_recovered'
  return null
}

/** A falling trend is reported once when it starts, and again only after it ended in between. */
export const trendTransition = (before: Trend | null, now: Trend): 'trend_down' | null =>
  now === 'down' && before !== 'down' ? 'trend_down' : null

/** Devices whose parent differs between two snapshots; devices missing in either are skipped. */
export const parentChangesBetween = (
  before: readonly { from: number; to: number; parent: boolean }[],
  after: readonly { from: number; to: number; parent: boolean }[],
) => {
  const parents = (links: typeof before) =>
    new Map(links.filter((l) => l.parent).map((l) => [l.from, l.to]))
  const old = parents(before)
  return [...parents(after)].flatMap(([device, to]) => {
    const from = old.get(device)
    return from !== undefined && from !== to ? [{ device, from, to }] : []
  })
}
