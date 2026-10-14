// The transmit error rate of a device from its cumulative MAC counters: what failed against what
// was sent between readings. A counter that went down means the device restarted and counts from
// zero again, so the new value is what it sent since.
import { HOUR } from './types'

export type CounterReading = { ts: number; unicast: number; broadcast: number; errors: number }

/** Frames sent and errors between a reading and the one before, at the time of the later one */
export type CounterDelta = { ts: number; frames: number; errors: number }

/** Over this window the rate is judged */
export const TX_ERROR_WINDOW = 24 * HOUR
/** A rate from this on is marked and reported */
export const TX_ERROR_WARN = 0.05
/** A reported rate counts as normal again below this, against flapping around the threshold */
export const TX_ERROR_CLEAR = 0.03
/** Fewer frames in the window say nothing: three failures out of twenty are chance */
export const TX_ERROR_MIN_FRAMES = 200
/** The same for one hour of the chart */
export const TX_ERROR_MIN_FRAMES_HOUR = 20

const restarted = (before: CounterReading, after: CounterReading) =>
  after.unicast < before.unicast ||
  after.broadcast < before.broadcast ||
  after.errors < before.errors

/** Differences between consecutive readings, oldest first; a restart counts from zero */
export const counterDeltas = (readings: readonly CounterReading[]): CounterDelta[] => {
  const sorted = [...readings].sort((a, b) => a.ts - b.ts)
  return sorted.slice(1).map((after, i) => {
    const before = sorted[i] as CounterReading
    const base = restarted(before, after) ? { unicast: 0, broadcast: 0, errors: 0 } : before
    return {
      ts: after.ts,
      frames: after.unicast - base.unicast + after.broadcast - base.broadcast,
      errors: after.errors - base.errors,
    }
  })
}

export type TxErrorRate = { rate: number; frames: number; errors: number }

/** Errors per frame over the deltas after `from`; null with too few frames to judge */
export const txErrorRate = (
  deltas: readonly CounterDelta[],
  from: number,
  minFrames = TX_ERROR_MIN_FRAMES,
): TxErrorRate | null => {
  let frames = 0
  let errors = 0
  for (const delta of deltas) {
    if (delta.ts <= from) continue
    frames += delta.frames
    errors += delta.errors
  }
  return frames < minFrames ? null : { rate: errors / frames, frames, errors }
}

/** The rate in percent per hour from `from` to `now`, null where an hour sent too little */
export const hourlyTxErrorRates = (deltas: readonly CounterDelta[], from: number, now: number) => {
  const start = Math.floor(from / HOUR) * HOUR
  const hours = Math.floor(now / HOUR) - start / HOUR + 1
  const sums = Array.from({ length: hours }, () => ({ frames: 0, errors: 0 }))
  for (const delta of deltas) {
    const sum = sums[Math.floor((delta.ts - start) / HOUR)]
    if (delta.ts < start || !sum) continue
    sum.frames += delta.frames
    sum.errors += delta.errors
  }
  return sums.map((s) =>
    s.frames < TX_ERROR_MIN_FRAMES_HOUR ? null : Math.round((s.errors / s.frames) * 1000) / 10,
  )
}

/** Marked from the warning rate on, unmarked below the clear rate; no judgement: no change */
export const txErrorTransition = (
  high: boolean,
  rate: TxErrorRate | null,
): 'tx_errors_high' | 'tx_errors_normal' | null => {
  if (rate === null) return null
  if (!high && rate.rate >= TX_ERROR_WARN) return 'tx_errors_high'
  if (high && rate.rate < TX_ERROR_CLEAR) return 'tx_errors_normal'
  return null
}
