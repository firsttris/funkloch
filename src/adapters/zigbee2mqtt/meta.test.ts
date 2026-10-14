import { describe, expect, test } from 'vitest'
import { zigbeeMeta, zigbeeScore } from './meta'

describe('zigbeeScore', () => {
  test('is LQI / 255 × 100', () => {
    expect(zigbeeScore(0)).toBe(0)
    expect(zigbeeScore(255)).toBe(100)
    expect(zigbeeScore(38)).toBe(15)
    expect(zigbeeScore(189)).toBe(74)
  })

  test('the weak threshold of 25 is LQI 64', () => {
    expect(zigbeeMeta.rawAtScore?.(25)).toBe(64)
  })
})

describe('formatLinkPair', () => {
  test('the LQI of both directions', () => {
    const { formatLinkPair } = zigbeeMeta
    expect(formatLinkPair({ lqi: 64, rssi: null }, { lqi: 15, rssi: null })).toBe('LQI 64/15')
    expect(formatLinkPair(null, { lqi: 55, rssi: null })).toBe('LQI 55')
    expect(formatLinkPair(null, null)).toBe('LQI –')
  })
})
