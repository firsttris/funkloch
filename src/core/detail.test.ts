import { describe, expect, test } from 'vitest'
import {
  connections,
  detailKpis,
  hourlyChart,
  offlineIntervals,
  parentChanges,
  parentSince,
  rawChart,
} from './detail'
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

describe('connections', () => {
  const link = (fromId: number, toId: number, parent: boolean, lqi: number) => ({
    fromId,
    toId,
    otherId: fromId === 1 ? toId : fromId,
    parent,
    lqi,
  })

  test('one entry per device; the uplink wins over its reverse neighbor link', () => {
    const result = connections(
      1,
      [link(2, 1, false, 90), link(1, 2, true, 80), link(3, 1, true, 40), link(1, 4, false, 200)],
      (l) => l.lqi,
    )
    expect(result.map((c) => [c.otherId, c.kind])).toEqual([
      [2, 'parent'],
      [3, 'child'],
      [4, 'neighbor'],
    ])
  })

  test('children and neighbors by link quality', () => {
    const result = connections(1, [link(3, 1, true, 40), link(5, 1, true, 120)], (l) => l.lqi)
    expect(result.map((c) => c.otherId)).toEqual([5, 3])
  })
})

describe('parentSince', () => {
  test('the start of the unbroken run up to the newest snapshot', () => {
    const history = [
      { ts: 1, parent: 'a' },
      { ts: 2, parent: 'b' },
      { ts: 3, parent: 'a' },
      { ts: 4, parent: 'a' },
    ]
    expect(parentSince(history, 'a')).toBe(3)
    expect(parentSince(history, 'b')).toBeNull()
    expect(parentSince([], 'a')).toBeNull()
  })
})
