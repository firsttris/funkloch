import { EventEmitter } from 'node:events'
import { describe, expect, test, vi } from 'vitest'
import type { Observation } from '~/core/types'
import {
  createZigbee2mqttAdapter,
  FIRST_MAP_AFTER,
  HEARD_WINDOW,
  heardSince,
  needsNames,
  networkmapDue,
} from './adapter'

// A broker stand-in: the test hands messages to the adapter as the broker would
const broker = vi.hoisted(() => ({ client: null as null | import('node:events').EventEmitter }))
vi.mock('mqtt', () => ({
  default: {
    connect: () => {
      const client = Object.assign(new EventEmitter(), {
        subscribe: () => {},
        publish: () => {},
        end: (_force: boolean, _opts: object, done: () => void) => done(),
      })
      broker.client = client
      return client
    },
  },
}))

const HOUR = 3_600_000

describe('networkmapDue', () => {
  test('the first map comes a few minutes after start', () => {
    expect(networkmapDue(null, 0, FIRST_MAP_AFTER - 1, 6)).toBe(false)
    expect(networkmapDue(null, 0, FIRST_MAP_AFTER, 6)).toBe(true)
  })

  test('then every configured interval, never more often than hourly', () => {
    expect(networkmapDue(0, 0, 6 * HOUR - 1, 6)).toBe(false)
    expect(networkmapDue(0, 0, 6 * HOUR, 6)).toBe(true)
    expect(networkmapDue(0, 0, 30 * 60_000, 0.1)).toBe(false)
    expect(networkmapDue(0, 0, HOUR, 0.1)).toBe(true)
  })
})

describe('heardSince', () => {
  test('only devices with an own reading inside the window count as heard', () => {
    const lastOwn = new Map([
      ['0xa', 10_000],
      ['0xb', 10_000 + HEARD_WINDOW],
    ])
    expect(heardSince(lastOwn, 10_000 + HEARD_WINDOW + 1)).toEqual(new Set(['0xb']))
  })
})

describe('needsNames', () => {
  test('device topics wait for the names, bridge topics do not', () => {
    expect(needsNames('z2m', 'z2m/Keller/Sensor/availability')).toBe(true)
    expect(needsNames('z2m', 'z2m/bridge/devices')).toBe(false)
    expect(needsNames('z2m', 'other/x')).toBe(false)
  })
})

describe('createZigbee2mqttAdapter', () => {
  const retained = (topic: string, payload: unknown) =>
    broker.client?.emit('message', topic, Buffer.from(JSON.stringify(payload)), { retain: true })

  test('a retained availability that arrives before the device list still counts', async () => {
    const adapter = createZigbee2mqttAdapter({
      url: 'mqtt://broker',
      baseTopic: 'z2m',
      networkmapHours: () => 6,
    })
    const seen: Observation[] = []
    const stop = adapter.start((o) => seen.push(o))
    retained('z2m/Keller/Sensor/availability', { state: 'offline' })
    expect(seen).toEqual([])
    retained('z2m/bridge/devices', [
      {
        ieee_address: '0x00158d0001a2b3c4',
        type: 'EndDevice',
        network_address: 4660,
        friendly_name: 'Keller/Sensor',
      },
    ])
    expect(seen.map((o) => o.kind)).toEqual(['devices', 'availability'])
    expect(seen[1]).toMatchObject({
      report: { address: '0x00158d0001a2b3c4', online: false },
    })
    await stop()
  })
})
