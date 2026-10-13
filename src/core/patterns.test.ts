import { describe, expect, test } from 'vitest'
import { findPattern, type HourCell, heatmapRow } from './patterns'
import { DAY, HOUR } from './types'

const thresholds = { good: 60, weak: 25 }
const now = 2000 * DAY
const utcHour = (ts: number) => new Date(ts).getUTCHours()

/** 7 days of hourly cells; `score(day, hourOfDay)` gives the median */
const week = (score: (day: number, hour: number) => number | null): HourCell[] =>
  Array.from({ length: 7 * 24 }, (_, i) => {
    const hour = now - 7 * DAY + i * HOUR
    return { hour, median: score(Math.floor(i / 24), i % 24), offlineMinutes: 0, count: 1 }
  })

describe('findPattern', () => {
  test('finds an evening that is weak every day', () => {
    const cells = week((_d, h) => (h >= 19 && h < 23 ? 10 : 50))
    expect(findPattern(cells, now, thresholds, utcHour)).toEqual({ from: 19, to: 23, days: 7 })
  })

  test('needs 5 of 7 days', () => {
    const five = week((d, h) => (h >= 2 && h < 4 && d < 5 ? 10 : 50))
    expect(findPattern(five, now, thresholds, utcHour)).toEqual({ from: 2, to: 4, days: 5 })
    const four = week((d, h) => (h >= 2 && h < 4 && d < 4 ? 10 : 50))
    expect(findPattern(four, now, thresholds, utcHour)).toBeNull()
  })

  test('a device that hovers at the threshold all day has no pattern', () => {
    const hovering = week((d, h) => ((d * 24 + h) % 3 === 0 || (h >= 0 && h < 2) ? 10 : 40))
    expect(findPattern(hovering, now, thresholds, utcHour)).toBeNull()
  })

  test('a device weak all day has no pattern', () => {
    expect(
      findPattern(
        week(() => 10),
        now,
        thresholds,
        utcHour,
      ),
    ).toBeNull()
  })

  test('no data, no pattern', () => {
    expect(
      findPattern(
        week(() => null),
        now,
        thresholds,
        utcHour,
      ),
    ).toBeNull()
    expect(findPattern([], now, thresholds, utcHour)).toBeNull()
  })
})

describe('heatmapRow', () => {
  test('codes good, mid, weak, offline and gaps', () => {
    const from = 100 * HOUR
    const cells: HourCell[] = [
      { hour: from, median: 80, offlineMinutes: 0, count: 3 },
      { hour: from + HOUR, median: 40, offlineMinutes: 0, count: 3 },
      { hour: from + 2 * HOUR, median: 10, offlineMinutes: 10, count: 3 },
      { hour: from + 3 * HOUR, median: null, offlineMinutes: 60, count: 0 },
      { hour: from + 5 * HOUR, median: null, offlineMinutes: 0, count: 0 },
    ]
    expect(heatmapRow(cells, from, 6, thresholds)).toBe('gmwo--')
  })
})
