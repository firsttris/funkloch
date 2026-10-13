import { median } from './stats'
import { HOUR } from './types'

export type Sample = { ts: number; score: number; raw: number }

export type HourlyRollup = {
  hour: number
  median: number
  min: number
  max: number
  rawMedian: number
  rawMin: number
  rawMax: number
  count: number
}

export const hourStart = (ts: number) => Math.floor(ts / HOUR) * HOUR

/** Condenses the samples of one hour; null when the hour has none. */
export const rollupHour = (hour: number, samples: readonly Sample[]): HourlyRollup | null => {
  const inHour = samples.filter((s) => hourStart(s.ts) === hour)
  if (inHour.length === 0) return null
  const scores = inHour.map((s) => s.score)
  const raws = inHour.map((s) => s.raw)
  return {
    hour,
    median: median(scores) as number,
    min: Math.min(...scores),
    max: Math.max(...scores),
    rawMedian: median(raws) as number,
    rawMin: Math.min(...raws),
    rawMax: Math.max(...raws),
    count: inHour.length,
  }
}

/** Complete hours from `from` (inclusive) to the hour containing `now` (exclusive). */
export const completeHours = (from: number, now: number): number[] => {
  const hours: number[] = []
  for (let hour = hourStart(from); hour < hourStart(now); hour += HOUR) hours.push(hour)
  return hours
}

/** One value per hour in [from, to), null where there is none; the hours come from `hourly`. */
export const hourlySeries = (
  points: readonly { hour: number; value: number }[],
  from: number,
  to: number,
): (number | null)[] => {
  const byHour = new Map(points.map((p) => [p.hour, p.value]))
  const series: (number | null)[] = []
  for (let hour = hourStart(from); hour < to; hour += HOUR) series.push(byHour.get(hour) ?? null)
  return series
}
