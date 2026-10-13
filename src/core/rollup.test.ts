import fc from 'fast-check'
import { describe, expect, test } from 'vitest'
import { completeHours, hourlySeries, hourStart, rollupHour } from './rollup'
import { HOUR, MINUTE } from './types'

describe('rollupHour', () => {
  const hour = 5 * HOUR

  test('condenses the samples of the hour', () => {
    const samples = [
      { ts: hour + MINUTE, score: 40, raw: 102 },
      { ts: hour + 20 * MINUTE, score: 60, raw: 153 },
      { ts: hour + 40 * MINUTE, score: 50, raw: 128 },
      { ts: hour + HOUR, score: 0, raw: 0 },
    ]
    expect(rollupHour(hour, samples)).toEqual({
      hour,
      median: 50,
      min: 40,
      max: 60,
      rawMedian: 128,
      rawMin: 102,
      rawMax: 153,
      count: 3,
    })
  })

  test('is null for an empty hour', () => {
    expect(rollupHour(hour, [])).toBeNull()
  })

  test('the median stays the same however the samples are ordered', () => {
    fc.assert(
      fc.property(
        fc.array(fc.record({ minute: fc.integer({ min: 0, max: 59 }), score: fc.nat(100) }), {
          minLength: 1,
        }),
        (rows) => {
          const samples = rows.map((r) => ({
            ts: hour + r.minute * MINUTE,
            score: r.score,
            raw: r.score,
          }))
          const a = rollupHour(hour, samples)
          const b = rollupHour(hour, [...samples].reverse())
          return a !== null && a.median === b?.median && a.min <= a.median && a.median <= a.max
        },
      ),
    )
  })
})

describe('hours', () => {
  test('hourStart floors to the hour', () => {
    expect(hourStart(3 * HOUR + 59 * MINUTE)).toBe(3 * HOUR)
  })

  test('completeHours leaves out the running hour', () => {
    expect(completeHours(HOUR + MINUTE, 4 * HOUR + MINUTE)).toEqual([HOUR, 2 * HOUR, 3 * HOUR])
    expect(completeHours(4 * HOUR, 4 * HOUR + MINUTE)).toEqual([])
  })

  test('hourlySeries fills gaps with null', () => {
    const points = [
      { hour: 0, value: 10 },
      { hour: 2 * HOUR, value: 30 },
    ]
    expect(hourlySeries(points, 0, 3 * HOUR)).toEqual([10, null, 30])
  })
})
