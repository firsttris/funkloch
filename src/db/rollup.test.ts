import { afterEach, describe, expect, test } from 'vitest'
import { HOUR, MINUTE } from '~/core/types'
import { checkReachability } from './reachability'
import { applyRetention } from './retention'
import { rollupPending } from './rollup'
import { devices, events, hourly, samples } from './schema'
import { applyDevices, storeBatch } from './store'
import { tempDb } from './test-db'

let cleanup = () => {}
afterEach(() => cleanup())
const setup = () => {
  const t = tempDb()
  cleanup = t.cleanup
  applyDevices(
    t.db,
    'zigbee',
    [
      {
        protocol: 'zigbee',
        address: 'a',
        name: 'Sensor',
        role: 'end_device',
        model: null,
        vendor: null,
        power: 'battery',
        networkAddress: null,
      },
    ],
    0,
  )
  return t.db
}

const sample = (ts: number, score: number) => ({
  protocol: 'zigbee',
  address: 'a',
  ts,
  score,
  raw: score * 2,
  lqi: score * 2,
  rssi: null,
  battery: null,
  source: 'message',
})

const T0 = 1000 * HOUR

describe('rollupPending', () => {
  test('rolls up complete hours once and catches up', () => {
    const db = setup()
    storeBatch(
      db,
      [sample(T0 + MINUTE, 40), sample(T0 + 30 * MINUTE, 60), sample(T0 + HOUR + MINUTE, 80)],
      [],
    )
    expect(rollupPending(db, T0 + HOUR + 5 * MINUTE)).toBe(1)
    expect(db.select().from(hourly).all()).toMatchObject([
      { hour: T0, median: 50, min: 40, max: 60, rawMedian: 100, count: 2, offlineMinutes: 0 },
    ])
    expect(rollupPending(db, T0 + HOUR + 6 * MINUTE)).toBe(0)
    expect(rollupPending(db, T0 + 3 * HOUR)).toBe(2)
    expect(
      db
        .select()
        .from(hourly)
        .all()
        .map((h) => h.count),
    ).toEqual([2, 1])
  })

  test('counts offline minutes, also for hours without samples', () => {
    const db = setup()
    // a message every 5 min for an hour, then silence
    storeBatch(
      db,
      Array.from({ length: 12 }, (_, i) => sample(T0 + i * 5 * MINUTE, 50)),
      [],
    )
    rollupPending(db, T0 + HOUR)
    expect(db.select().from(devices).get()?.typicalInterval).toBe(5 * MINUTE)

    // 30 min of silence is the minimum before offline
    expect(checkReachability(db, T0 + 55 * MINUTE + 31 * MINUTE)).toBe(1)
    expect(db.select({ type: events.type }).from(events).all()).toEqual([{ type: 'offline' }])

    rollupPending(db, T0 + 3 * HOUR)
    const rows = db.select().from(hourly).all()
    expect(rows.map((r) => [r.count, r.offlineMinutes])).toEqual([
      [12, 0],
      [0, 34],
      [0, 60],
    ])
  })
})

describe('checkReachability', () => {
  test('a device comes back online with its next message', () => {
    const db = setup()
    storeBatch(
      db,
      Array.from({ length: 4 }, (_, i) => sample(T0 + i * MINUTE, 50)),
      [],
    )
    rollupPending(db, T0 + HOUR)
    checkReachability(db, T0 + 2 * HOUR)
    storeBatch(db, [sample(T0 + 2 * HOUR + MINUTE, 50)], [])
    checkReachability(db, T0 + 2 * HOUR + 2 * MINUTE)
    expect(db.select({ type: events.type }).from(events).all()).toEqual([
      { type: 'offline' },
      { type: 'online' },
    ])
  })

  test('a device never seen keeps its state', () => {
    const db = setup()
    expect(checkReachability(db, T0)).toBe(0)
  })
})

describe('applyRetention', () => {
  test('drops raw samples after 14 days and keeps the hourly rows', () => {
    const db = setup()
    storeBatch(db, [sample(T0, 50), sample(T0 + 20 * 24 * HOUR, 50)], [])
    rollupPending(db, T0 + HOUR)
    applyRetention(db, T0 + 20 * 24 * HOUR)
    expect(db.select().from(samples).all()).toHaveLength(1)
    expect(db.select().from(hourly).all()).toHaveLength(1)
  })
})
