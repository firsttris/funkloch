// Recurring weak hours and the heatmap cells, from hourly rollups.
import { band, type Thresholds } from './score'
import { DAY, HOUR } from './types'

export type HourCell = {
  hour: number
  median: number | null
  offlineMinutes: number
  count: number
}

export const PATTERN_DAYS = 7
export const PATTERN_MIN_DAYS = 5
/** Longer weak stretches are a weak device, not a pattern */
export const PATTERN_MAX_HOURS = 12
/** Outside the stretch the device may be weak in at most this share of hours */
export const PATTERN_MAX_WEAK_OUTSIDE = 0.25

export type Pattern = { from: number; to: number; days: number }

/**
 * A stretch of local hours in which the device was weak on at least 5 of the last 7 days, e.g.
 * every evening from 19 to 23. `hourOfDay` maps a timestamp to the local hour (time zone).
 */
export const findPattern = (
  cells: readonly HourCell[],
  now: number,
  thresholds: Thresholds,
  hourOfDay: (ts: number) => number,
): Pattern | null => {
  const from = now - PATTERN_DAYS * DAY
  const weakDays = Array.from({ length: 24 }, () => new Set<number>())
  const recent = cells.filter((c) => c.hour >= from && c.hour < now && c.median !== null)
  for (const cell of recent) {
    if ((cell.median ?? 100) < thresholds.weak) {
      weakDays[hourOfDay(cell.hour)]?.add(Math.floor((cell.hour - from) / DAY))
    }
  }
  /** A device that is often weak anyway has no pattern, only a weak signal */
  const quietOutside = (start: number, end: number) => {
    const outside = recent.filter((c) => {
      const h = hourOfDay(c.hour)
      return h < start || h >= end
    })
    const weak = outside.filter((c) => (c.median ?? 100) < thresholds.weak).length
    return outside.length === 0 || weak / outside.length <= PATTERN_MAX_WEAK_OUTSIDE
  }
  const counts = weakDays.map((days) => days.size)
  let best: Pattern | null = null
  let start: number | null = null
  for (let h = 0; h <= 24; h++) {
    const hit = h < 24 && (counts[h] ?? 0) >= PATTERN_MIN_DAYS
    if (hit && start === null) start = h
    if (!hit && start !== null) {
      const length = h - start
      const days = Math.min(...counts.slice(start, h))
      const longest = !best || length > best.to - best.from
      if (length <= PATTERN_MAX_HOURS && longest && quietOutside(start, h)) {
        best = { from: start, to: h, days }
      }
      start = null
    }
  }
  return best
}

/** One heatmap cell: g(ood), m(id), w(eak), o(ffline) or - (no data) */
export type CellCode = 'g' | 'm' | 'w' | 'o' | '-'

const CODE = { good: 'g', mid: 'm', weak: 'w' } as const

/** The cells of one device from `from` (a full hour) for `hours` hours, as one string */
export const heatmapRow = (
  cells: readonly HourCell[],
  from: number,
  hours: number,
  thresholds: Thresholds,
) => {
  const byHour = new Map(cells.map((c) => [c.hour, c]))
  let row = ''
  for (let i = 0; i < hours; i++) {
    const cell = byHour.get(from + i * HOUR)
    if (!cell) row += '-'
    else if (cell.offlineMinutes >= 30) row += 'o'
    else if (cell.median === null) row += '-'
    else row += CODE[band(cell.median, thresholds)]
  }
  return row
}
