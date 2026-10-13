import { afterEach, describe, expect, test } from 'vitest'
import type { Measurement } from '~/core/types'
import { channelScans, devices, samples } from '~/db/schema'
import { applyDevices, getSetting } from '~/db/store'
import { tempDb } from '~/db/test-db'
import { createIngest } from './ingest'
import { createLog } from './log'

let cleanup = () => {}
afterEach(() => cleanup())

const measurement = (ts: number, raw: number): Measurement => ({
  protocol: 'zigbee',
  address: 'a',
  ts,
  score: Math.round((raw / 255) * 100),
  raw,
  lqi: raw,
  rssi: null,
  battery: null,
  source: 'test',
})

describe('createIngest', () => {
  test('a burst within one millisecond keeps every sample', () => {
    const t = tempDb()
    const ingest = createIngest(t.db, createLog('silent'))
    cleanup = () => {
      ingest.stop()
      t.cleanup()
    }
    applyDevices(
      t.db,
      'zigbee',
      [
        {
          protocol: 'zigbee',
          address: 'a',
          name: 'A',
          role: 'router',
          model: null,
          vendor: null,
          power: 'mains',
          networkAddress: null,
        },
      ],
      0,
    )
    for (const raw of [10, 20, 30])
      ingest.emit({ kind: 'measurement', measurement: measurement(5000, raw) })
    ingest.flush()
    expect(t.db.select({ ts: samples.ts, raw: samples.raw }).from(samples).all()).toEqual([
      { ts: 5000, raw: 10 },
      { ts: 5001, raw: 20 },
      { ts: 5002, raw: 30 },
    ])
  })

  test('a partial device list removes nothing; channel scans and channels are stored', () => {
    const t = tempDb()
    const ingest = createIngest(t.db, createLog('silent'))
    cleanup = () => {
      ingest.stop()
      t.cleanup()
    }
    const info = (address: string) => ({
      protocol: 'thread',
      address,
      name: address,
      role: 'router' as const,
      model: null,
      vendor: null,
      power: 'mains' as const,
      networkAddress: null,
    })
    ingest.emit({
      kind: 'devices',
      protocol: 'thread',
      ts: 1,
      devices: [info('a'), info('b')],
      complete: false,
    })
    ingest.emit({
      kind: 'devices',
      protocol: 'thread',
      ts: 2,
      devices: [info('a')],
      complete: false,
    })
    expect(
      t.db
        .select()
        .from(devices)
        .all()
        .map((d) => d.removedAt),
    ).toEqual([null, null])

    ingest.emit({
      kind: 'channels',
      protocol: 'thread',
      ts: 3,
      channels: [
        { channel: 11, energy: -64 },
        { channel: 25, energy: -91 },
      ],
    })
    ingest.emit({ kind: 'channel', protocol: 'thread', channel: 25 })
    expect(t.db.select().from(channelScans).all()).toEqual([
      { ts: 3, channel: 11, energy: -64 },
      { ts: 3, channel: 25, energy: -91 },
    ])
    expect(getSetting(t.db, 'channel:thread')).toBe(25)
  })
})
