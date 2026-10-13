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
