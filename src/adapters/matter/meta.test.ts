import { describe, expect, test } from 'vitest'
import { wifiMeta, wifiScore } from './meta'

describe('wifiScore', () => {
  test('is linear between −90 and −50 dBm', () => {
    expect(wifiScore(-90)).toBe(0)
    expect(wifiScore(-50)).toBe(100)
    expect(wifiScore(-70)).toBe(50)
    expect(wifiScore(-40)).toBe(100)
  })

  test('the default thresholds sit at −66 and −80 dBm', () => {
    expect(wifiMeta.rawAtScore?.(60)).toBe(-66)
    expect(wifiMeta.rawAtScore?.(25)).toBe(-80)
  })
})

describe('formats', () => {
  test('the station’s RSSI, with a real minus', () => {
    expect(wifiMeta.formatRaw({ raw: -61, lqi: null, rssi: -61 })).toBe('−61 dBm')
    expect(wifiMeta.formatLinkPair({ lqi: null, rssi: -72 }, null)).toBe('−72 dBm')
    expect(wifiMeta.formatLink({ lqi: null, rssi: null })).toBe('–')
  })
})
