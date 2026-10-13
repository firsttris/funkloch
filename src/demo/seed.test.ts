import { afterEach, describe, expect, test } from 'vitest'
import { HOUR } from '~/core/types'
import { devices, events, hourly, samples, snapshots } from '~/db/schema'
import { tempDb } from '~/db/test-db'
import { DEMO_DEVICES } from './devices'
import { history } from './generate'
import { seedDemo } from './seed'

let cleanup = () => {}
afterEach(() => cleanup())

const NOW = Date.parse('2026-10-13T06:30:00Z')

describe('seedDemo', () => {
  test('fills 30 days of the mockup network', { timeout: 30_000 }, () => {
    const t = tempDb()
    cleanup = t.cleanup
    seedDemo(t.db, NOW)
    expect(t.db.select().from(devices).all()).toHaveLength(DEMO_DEVICES.length + 2)
    expect(t.db.select().from(hourly).all().length).toBeGreaterThan(DEMO_DEVICES.length * 24 * 29)
    // raw samples only for 14 days
    const oldest = Math.min(
      ...t.db
        .select({ ts: samples.ts })
        .from(samples)
        .all()
        .map((s) => s.ts),
    )
    expect(oldest).toBeGreaterThanOrEqual(NOW - 14 * 24 * HOUR)
    expect(t.db.select().from(snapshots).all().length).toBeGreaterThan(0)
    const garage = t.db
      .select()
      .from(devices)
      .all()
      .find((d) => d.name === 'Türsensor Garage')
    expect(garage).toMatchObject({ online: false, reportedOnline: false })
    expect(
      t.db
        .select()
        .from(events)
        .all()
        .map((e) => e.type),
    ).toEqual([
      'offline',
      'offline',
      'online',
      'parent_changed',
      'parent_changed',
      'trend_down',
      'trend_down',
      'pattern',
      'signal_weak',
    ])
  })

  test('the history is the same for the same seed and time', () => {
    const device = DEMO_DEVICES[1]
    if (!device) throw new Error('no demo device')
    expect(history(device, NOW, 2)).toEqual(history(device, NOW, 2))
  })
})
