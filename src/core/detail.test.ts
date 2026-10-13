import { describe, expect, test } from 'vitest'
import { detailKpis, hourlyChart, offlineIntervals, parentChanges, rawChart } from './detail'
import { DAY, HOUR } from './types'

describe('offlineIntervals', () => {
  test('pairs offline with the next online, an open one ends at the range end', () => {
    const changes = [
      { ts: 10, online: false },
      { ts: 20, online: true },
      { ts: 30, online: false },
    ]
    expect(offlineIntervals(changes, true, 0, 50)).toEqual([
      [10, 20],
      [30, 50],
    ])
  })

  test('a range that starts offline begins with an interval', () => {
    expect(offlineIntervals([{ ts: 5, online: true }], false, 0, 50)).toEqual([[0, 5]])
  })
})

describe('parentChanges', () => {
  test('counts changes and skips unknown snapshots', () => {
    expect(parentChanges(['a', 'a', null, 'b', 'b', 'c'])).toBe(2)
    expect(parentChanges([])).toBe(0)
  })
})

describe('detailKpis', () => {
  test('median, change from the first to the last day and messages per hour', () => {
    const now = 1000 * HOUR
    const hourly = Array.from({ length: 7 * 24 }, (_, i) => {
      const hour = now - 7 * DAY + i * HOUR
      const median = i < 24 ? 50 : i >= 6 * 24 ? 25 : 40
      return { hour, median, rawMedian: median * 2 }
    })
    expect(detailKpis(hourly, 96, now)).toEqual({
      rawMedian7d: 80,
      changePercent: -50,
      messagesPerHour: 2,
    })
  })

  test('no data gives no change', () => {
    expect(detailKpis([], 0, 0)).toEqual({
      rawMedian7d: null,
      changePercent: null,
      messagesPerHour: 0,
    })
  })
})

describe('charts', () => {
  test('hourlyChart has a point per hour and null for missing hours', () => {
    const rows = [{ hour: 2 * HOUR, rawMedian: 100, rawMin: 90, rawMax: 110 }]
    expect(hourlyChart(rows, HOUR, 3 * HOUR)).toEqual({
      x: [3600, 7200, 10800],
      median: [null, 100, null],
      min: [null, 90, null],
      max: [null, 110, null],
    })
  })

  test('rawChart breaks the line at long gaps', () => {
    const chart = rawChart([
      { ts: 0, raw: 1 },
      { ts: 1000, raw: 2 },
      { ts: 3 * HOUR, raw: 3 },
    ])
    expect(chart.median).toEqual([1, 2, null, 3])
    expect(chart.x).toEqual([0, 1, 1.001, 10800])
  })
})
