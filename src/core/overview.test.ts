import { describe, expect, test } from 'vitest'
import { buildOverview, type OverviewDevice } from './overview'
import { HOUR } from './types'

const now = 1000 * HOUR + 30 * 60_000
const device = (id: number, name: string, protocol = 'zigbee', online = true): OverviewDevice => ({
  id,
  protocol,
  name,
  model: null,
  vendor: null,
  role: 'router',
  online,
  lastSeen: now,
})
const flat = (value: number, hours = 72) =>
  Array.from({ length: hours }, (_, i) => ({
    hour: 1000 * HOUR - (hours - 1 - i) * HOUR,
    median: value,
  }))

describe('buildOverview', () => {
  const result = buildOverview({
    now,
    rangeHours: 24,
    devices: [
      device(1, 'Gut'),
      device(2, 'Offline', 'zigbee', false),
      device(3, 'Schwach', 'thread'),
      device(4, 'Neu'),
    ],
    recentScores: new Map([
      [1, [80, 90, 85]],
      [3, [10]],
    ]),
    hourly: new Map([
      [1, flat(84)],
      [2, flat(50)],
      [3, flat(20)],
    ]),
    via: new Map([[3, 'Thermostat Büro']]),
  })

  test('sorts worst first and keeps devices without data last', () => {
    expect(result.rows.map((r) => [r.name, r.status, r.score])).toEqual([
      ['Offline', 'offline', 50],
      ['Schwach', 'weak', 10],
      ['Gut', 'good', 85],
      ['Neu', 'unknown', null],
    ])
  })

  test('the sparkline has one value per hour of the range, the running hour last', () => {
    const gut = result.rows.find((r) => r.id === 1)
    expect(gut?.spark).toHaveLength(24)
    expect(gut?.spark.at(-1)).toBe(84)
    expect(result.rows.find((r) => r.id === 4)?.spark.every((v) => v === null)).toBe(true)
  })

  test('counts per protocol and the problem cards', () => {
    expect(result.counts).toEqual({
      total: 4,
      byProtocol: { thread: 1, zigbee: 3 },
      offline: 1,
      weak: 1,
      down: 0,
    })
    expect(result.rows.find((r) => r.id === 3)?.via).toBe('Thermostat Büro')
  })
})
