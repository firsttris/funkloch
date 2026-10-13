import { afterEach, describe, expect, test } from 'vitest'
import type { DeviceInfo } from '~/core/types'
import { HOUR, MINUTE } from '~/core/types'
import { detectSignal, detectTrends } from './detect'
import { rollupPending } from './rollup'
import { devices, events } from './schema'
import { applyDevices, storeBatch, storeTopology } from './store'
import { tempDb } from './test-db'

let cleanup = () => {}
afterEach(() => cleanup())

const device = (address: string, role: DeviceInfo['role'] = 'end_device'): DeviceInfo => ({
  protocol: 'zigbee',
  address,
  name: address.toUpperCase(),
  role,
  model: null,
  vendor: null,
  power: 'battery',
  networkAddress: null,
})

const setup = () => {
  const t = tempDb()
  cleanup = t.cleanup
  applyDevices(
    t.db,
    'zigbee',
    [device('c', 'coordinator'), device('r1', 'router'), device('r2', 'router'), device('s')],
    0,
  )
  return t.db
}

const sample = (ts: number, score: number) => ({
  protocol: 'zigbee',
  address: 's',
  ts,
  score,
  raw: score * 2,
  lqi: score * 2,
  rssi: null,
  battery: null,
  source: 'test',
})

const T0 = 1000 * HOUR
const thresholds = { good: 60, weak: 25 }
const types = (db: ReturnType<typeof setup>) =>
  db
    .select({ type: events.type })
    .from(events)
    .all()
    .map((e) => e.type)

describe('detectSignal', () => {
  test('weak once, recovered once, with the value in the text', () => {
    const db = setup()
    storeBatch(db, [sample(T0, 10), sample(T0 + MINUTE, 12)], [])
    expect(detectSignal(db, T0 + 2 * MINUTE, thresholds, 30)).toBe(1)
    expect(detectSignal(db, T0 + 3 * MINUTE, thresholds, 30)).toBe(0)
    storeBatch(db, [sample(T0 + 40 * MINUTE, 50), sample(T0 + 41 * MINUTE, 52)], [])
    expect(detectSignal(db, T0 + 42 * MINUTE, thresholds, 30)).toBe(1)
    expect(types(db)).toEqual(['signal_weak', 'signal_recovered'])
    expect(db.select().from(events).get()?.details).toMatchObject({
      value: '24',
      threshold: '25 %',
    })
  })

  test('an offline device makes no signal event', () => {
    const db = setup()
    db.update(devices).set({ online: false }).run()
    storeBatch(db, [sample(T0, 10)], [])
    expect(detectSignal(db, T0 + MINUTE, thresholds, 30)).toBe(0)
  })
})

describe('detectTrends', () => {
  test('a falling series makes one event, a repeat none', () => {
    const db = setup()
    const rows = Array.from({ length: 72 }, (_, i) => sample(T0 + i * HOUR, 60 - (i / 71) * 30))
    storeBatch(db, rows, [])
    const now = T0 + 72 * HOUR + MINUTE
    rollupPending(db, now)
    expect(detectTrends(db, now)).toBe(1)
    expect(detectTrends(db, now)).toBe(0)
    expect(db.select().from(events).get()).toMatchObject({
      type: 'trend_down',
      details: { change: -30 },
    })
  })
})

describe('topology and role events', () => {
  test('a new parent between two snapshots is an event, the first snapshot makes none', () => {
    const db = setup()
    const map = (parent: string, ts: number) => ({
      protocol: 'zigbee',
      ts,
      links: [
        { from: 's', to: parent, lqi: 40, rssi: null, parent: true },
        { from: 'r1', to: 'c', lqi: 200, rssi: null, parent: true },
      ],
    })
    storeTopology(db, map('r1', 1))
    storeTopology(db, map('r1', 2))
    storeTopology(db, map('r2', 3))
    expect(db.select().from(events).all()).toMatchObject([
      { type: 'parent_changed', kind: 'topology', details: { from: 'R1', to: 'R2' } },
    ])
  })

  test('a changed role in the device list is an event', () => {
    const db = setup()
    applyDevices(
      db,
      'zigbee',
      [device('c', 'coordinator'), device('r1', 'router'), device('r2', 'end_device'), device('s')],
      5,
    )
    expect(db.select().from(events).all()).toMatchObject([
      { type: 'role_changed', details: { from: 'router', to: 'end_device' } },
    ])
  })
})
