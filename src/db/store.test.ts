import { eq } from 'drizzle-orm'
import { afterEach, describe, expect, test } from 'vitest'
import type { DeviceInfo, Measurement } from '~/core/types'
import { devices, events, links, samples } from './schema'
import { applyDevices, storeBatch, storeBridgeState, storeTopology } from './store'
import { tempDb } from './test-db'

const device = (address: string, name = address): DeviceInfo => ({
  protocol: 'zigbee',
  address,
  name,
  role: 'router',
  model: null,
  vendor: null,
  power: 'mains',
  networkAddress: null,
})

const measurement = (address: string, ts: number, lqi: number): Measurement => ({
  protocol: 'zigbee',
  address,
  ts,
  score: Math.round((lqi / 255) * 100),
  raw: lqi,
  lqi,
  rssi: null,
  battery: null,
  source: 'message',
})

let cleanup = () => {}
afterEach(() => cleanup())
const setup = () => {
  const t = tempDb()
  cleanup = t.cleanup
  return t.db
}

describe('applyDevices', () => {
  test('the first list adds devices without events, later changes make events', () => {
    const db = setup()
    applyDevices(db, 'zigbee', [device('a'), device('b')], 1)
    expect(db.select().from(devices).all()).toHaveLength(2)
    expect(db.select().from(events).all()).toEqual([])

    applyDevices(db, 'zigbee', [device('a', 'Lampe'), device('c')], 2)
    const rows = db.select().from(devices).all()
    expect(rows.find((d) => d.address === 'a')?.name).toBe('Lampe')
    expect(rows.find((d) => d.address === 'b')?.removedAt).toBe(2)
    expect(db.select({ type: events.type }).from(events).all()).toEqual([
      { type: 'device_added' },
      { type: 'device_removed' },
    ])
  })

  test('a removed device that comes back is active again', () => {
    const db = setup()
    applyDevices(db, 'zigbee', [device('a'), device('b')], 1)
    applyDevices(db, 'zigbee', [device('a')], 2)
    applyDevices(db, 'zigbee', [device('a'), device('b')], 3)
    expect(db.select().from(devices).where(eq(devices.address, 'b')).get()?.removedAt).toBeNull()
  })
})

describe('storeBatch', () => {
  test('stores samples, keeps the latest lastSeen and the battery', () => {
    const db = setup()
    applyDevices(db, 'zigbee', [device('a')], 1)
    storeBatch(
      db,
      [measurement('a', 200, 100), measurement('a', 100, 50)],
      [{ protocol: 'zigbee', address: 'a', ts: 150, battery: 64 }],
    )
    expect(db.select().from(samples).all()).toHaveLength(2)
    expect(db.select().from(devices).get()).toMatchObject({ lastSeen: 200, battery: 64 })
  })

  test('a measurement of an unknown device creates it, a duplicate is ignored', () => {
    const db = setup()
    storeBatch(db, [measurement('x', 5, 10), measurement('x', 5, 10)], [])
    expect(db.select().from(devices).get()).toMatchObject({ address: 'x', name: 'x' })
    expect(db.select().from(samples).all()).toHaveLength(1)
  })
})

describe('storeTopology', () => {
  test('keeps links between known devices', () => {
    const db = setup()
    applyDevices(db, 'zigbee', [device('a'), device('b')], 1)
    storeTopology(db, {
      protocol: 'zigbee',
      ts: 10,
      links: [
        { from: 'a', to: 'b', lqi: 41, rssi: null, parent: true },
        { from: 'a', to: 'unknown', lqi: 9, rssi: null, parent: false },
      ],
    })
    expect(db.select().from(links).all()).toMatchObject([{ lqi: 41, parent: true }])
  })
})

describe('storeBridgeState', () => {
  test('only a change after the first state is an event', () => {
    const db = setup()
    storeBridgeState(db, 'zigbee', true, 1)
    storeBridgeState(db, 'zigbee', true, 2)
    storeBridgeState(db, 'zigbee', false, 3)
    expect(db.select({ type: events.type, ts: events.ts }).from(events).all()).toEqual([
      { type: 'bridge_offline', ts: 3 },
    ])
  })
})
