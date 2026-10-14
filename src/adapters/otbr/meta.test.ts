import fc from 'fast-check'
import { describe, expect, test } from 'vitest'
import { threadMeta, threadScore } from './meta'

describe('threadScore', () => {
  test('is linear in the RSSI with link quality 3', () => {
    expect(threadScore(-100, 3)).toBe(0)
    expect(threadScore(-75, 3)).toBe(50)
    expect(threadScore(-50, 3)).toBe(100)
    expect(threadScore(-40, 3)).toBe(100)
  })

  test('is capped by the link quality', () => {
    expect(threadScore(-52, 2)).toBe(59)
    expect(threadScore(-52, 1)).toBe(24)
    expect(threadScore(-52, 0)).toBe(0)
    expect(threadScore(-90, 2)).toBe(20)
  })

  test('is always 0 to 100', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -130, max: 10 }),
        fc.integer({ min: -1, max: 5 }),
        (rssi, lqi) => {
          const score = threadScore(rssi, lqi)
          return score >= 0 && score <= 100
        },
      ),
    )
  })
})

describe('formatLinkPair', () => {
  test('both RSSI values, else the link quality', () => {
    const { formatLinkPair } = threadMeta
    expect(formatLinkPair({ lqi: 2, rssi: -75 }, { lqi: 1, rssi: -86 })).toBe('−75/−86 dBm')
    expect(formatLinkPair({ lqi: 2, rssi: -75 }, null)).toBe('−75 dBm')
    expect(formatLinkPair({ lqi: 2, rssi: null }, { lqi: 3, rssi: null })).toBe('LQI 2/3')
    expect(formatLinkPair(null, null)).toBe('–')
  })
})
