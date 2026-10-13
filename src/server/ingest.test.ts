import { afterEach, describe, expect, test } from 'vitest'
import type { Measurement } from '~/core/types'
import { samples } from '~/db/schema'
import { applyDevices } from '~/db/store'
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
})
