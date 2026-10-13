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
})
