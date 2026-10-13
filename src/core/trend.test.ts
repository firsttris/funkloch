import { describe, expect, test } from 'vitest'
import { trend } from './trend'
import { HOUR } from './types'

const now = 1000 * HOUR
const series = (f: (i: number) => number, hours = 72) =>
  Array.from({ length: hours }, (_, i) => ({ hour: now - (hours - 1 - i) * HOUR, median: f(i) }))

describe('trend', () => {
  test('a drop of more than 15 points over 72 h is falling', () => {
    expect(
      trend(
        series((i) => 60 - (i / 71) * 20),
        now,
      ),
    ).toBe('down')
  })

  test('a drop of 10 points is stable', () => {
    expect(
      trend(
        series((i) => 60 - (i / 71) * 10),
        now,
      ),
    ).toBe('flat')
  })

  test('a rise of more than 15 points is rising', () => {
    expect(
      trend(
        series((i) => 40 + (i / 71) * 20),
        now,
      ),
    ).toBe('up')
  })

  test('noise around a level is stable', () => {
    expect(
      trend(
        series((i) => 50 + (i % 2 === 0 ? 8 : -8)),
        now,
      ),
    ).toBe('flat')
  })

  test('needs a day of hourly values within the window', () => {
    expect(
      trend(
        series(() => 50, 10),
        now,
      ),
    ).toBe('none')
    const old = series((i) => 60 - i, 72).map((h) => ({ ...h, hour: h.hour - 10 * 24 * HOUR }))
    expect(trend(old, now)).toBe('none')
  })

  /** 73 hourly medians ending at `at`: a decline by `drop`, weak by `dip` from 19 to 23 h */
  const evenings = (at: number, drop: number, dip: number) =>
    Array.from({ length: 73 }, (_, i) => {
      const hour = at - (72 - i) * HOUR
      const h = Math.floor(hour / HOUR) % 24
      return { hour, median: 52 - (i / 72) * drop - (h >= 19 && h < 23 ? dip : 0) }
    })

  test('an evening dip does not tilt a small decline into falling, at any hour', () => {
    // Without taking the daily rhythm out, this read as falling in the late evening and at night
    for (let end = 0; end < 24; end++) {
      const at = now + end * HOUR
      expect(trend(evenings(at, 10, 30), at)).toBe('flat')
    }
  })

  test('a real decline under an evening dip is falling, at any hour', () => {
    for (let end = 0; end < 24; end++) {
      const at = now + end * HOUR
      expect(trend(evenings(at, 25, 30), at)).toBe('down')
    }
  })
})
