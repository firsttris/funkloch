import fc from 'fast-check'
import { describe, expect, test } from 'vitest'
import { median, slope } from './stats'

describe('median', () => {
  test('handles odd, even and empty lists', () => {
    expect(median([3, 1, 2])).toBe(2)
    expect(median([4, 1, 3, 2])).toBe(2.5)
    expect(median([])).toBeNull()
  })

  test('does not depend on the order and lies between min and max', () => {
    fc.assert(
      fc.property(fc.array(fc.integer({ min: 0, max: 100 }), { minLength: 1 }), (values) => {
        const m = median(values) as number
        const shuffled = [...values].reverse()
        return m === median(shuffled) && m >= Math.min(...values) && m <= Math.max(...values)
      }),
    )
  })
})

describe('slope', () => {
  test('finds the slope of a line', () => {
    expect(slope([0, 1, 2, 3].map((x) => ({ x, y: 2 * x + 1 })))).toBeCloseTo(2)
  })

  test('is null without two distinct x values', () => {
    expect(slope([{ x: 1, y: 1 }])).toBeNull()
    expect(
      slope([
        { x: 1, y: 1 },
        { x: 1, y: 3 },
      ]),
    ).toBeNull()
  })
})
