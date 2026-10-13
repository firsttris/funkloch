import { describe, expect, test } from 'vitest'
import { BUSY_DBM, CHANNELS, channelBars, newlyBusy } from './channels'

describe('channelBars', () => {
  test('16 bars, levels between floor and top, networks marked', () => {
    const bars = channelBars(
      [
        { channel: 11, energy: -64 },
        { channel: 15, energy: -86 },
        { channel: 25, energy: -120 },
        { channel: 26, energy: -40 },
      ],
      { zigbee: 15, thread: 25 },
    )
    expect(bars.map((b) => b.channel)).toEqual(CHANNELS)
    expect(bars[0]).toEqual({ channel: 11, energy: -64, level: 0.8, busy: true, network: null })
    expect(bars[4]).toMatchObject({ channel: 15, busy: false, network: 'zigbee' })
    expect(bars[14]).toMatchObject({ channel: 25, level: 0, network: 'thread' })
    expect(bars[15]?.level).toBe(1)
    expect(bars[1]).toEqual({ channel: 12, energy: null, level: 0, busy: false, network: null })
  })
})

describe('newlyBusy', () => {
  const networks = { zigbee: 15, thread: 25 }
  const scan = (z: number, t: number) => [
    { channel: 15, energy: z },
    { channel: 25, energy: t },
  ]

  test('a network channel that turns busy is reported once', () => {
    expect(newlyBusy(scan(-90, -90), scan(-70, -90), networks)).toEqual([
      { protocol: 'zigbee', channel: 15, energy: -70 },
    ])
    expect(newlyBusy(scan(-70, -90), scan(-68, -90), networks)).toEqual([])
  })

  test('the first scan counts too, the threshold itself is still quiet', () => {
    expect(newlyBusy([], scan(BUSY_DBM, -60), networks)).toEqual([
      { protocol: 'thread', channel: 25, energy: -60 },
    ])
  })
})
