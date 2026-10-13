// Ebene 5: the views behind the server functions, on a seeded database
import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { deviceView } from '~/server/views/device'
import { networkView } from '~/server/views/network'
import { overviewView } from '~/server/views/overview'
import { seeded } from './helpers'

let env: ReturnType<typeof seeded>
beforeAll(() => {
  env = seeded()
}, 30_000)
afterAll(() => env.cleanup())

const idOf = (name: string) => {
  const row = overviewView(env.context, '24h').rows.find((r) => r.name === name)
  if (!row) throw new Error(`no device ${name}`)
  return row.id
}

describe('overview', () => {
  test('lists the 13 demo devices, worst first, with KPIs', () => {
    const view = overviewView(env.context, '24h')
    expect(view.rows).toHaveLength(13)
    expect(view.rows[0]).toMatchObject({ name: 'Türsensor Garage', status: 'offline' })
    expect(view.rows[1]).toMatchObject({
      name: 'Temperatursensor Keller',
      status: 'weak',
      trend: 'down',
    })
    expect(view.counts).toMatchObject({
      total: 13,
      offline: 1,
      byProtocol: { zigbee: 8, thread: 5 },
    })
    expect(view.protocols.map((p) => p.id).sort()).toEqual(['thread', 'zigbee'])
  })

  test('every row has a raw text and a parent, sparklines have the range length', () => {
    for (const row of overviewView(env.context, '24h').rows) {
      expect(row.rawText).toMatch(/LQI/)
      expect(row.via).not.toBeNull()
      expect(row.spark).toHaveLength(24)
    }
    expect(overviewView(env.context, '7d').rows[0]?.spark).toHaveLength(168)
  })

  test('other thresholds change the traffic light', () => {
    const strict = {
      ...env.context,
      settings: { ...env.context.settings, thresholds: { good: 95, weak: 90 } },
    }
    const statuses = overviewView(strict, '24h').rows.map((r) => r.status)
    expect(statuses.filter((s) => s === 'good')).toEqual([])
  })
})

describe('device detail', () => {
  test('the cellar sensor: weak, falling, below threshold, two parent changes', () => {
    const view = deviceView(env.context, idOf('Temperatursensor Keller'), '7d')
    expect(view).not.toBeNull()
    expect(view?.status).toBe('weak')
    expect(view?.trend).toBe('down')
    expect(view?.weakRaw).toBe(64)
    expect(view?.current?.raw).toBeLessThan(64)
    expect(view?.kpis.parentChanges).toBe(2)
    expect(view?.kpis.changePercent).toBeLessThan(-30)
    expect(view?.via).toBe('Steckdose Waschküche')
    expect(view?.offline).toHaveLength(1)
    expect(view?.chart.x.length).toBeGreaterThan(160)
    expect(view?.messages.values).toHaveLength(48)
    expect(view?.events.map((e) => e.type)).toEqual(['online', 'offline'])
  })

  test('24 h reads raw samples, 30 days one point per hour', () => {
    const id = idOf('Lampe Küche')
    const day = deviceView(env.context, id, '24h')
    const month = deviceView(env.context, id, '30d')
    expect(day?.chart.max.every((v) => v === null)).toBe(true)
    expect(day?.chart.x.length).toBeGreaterThan(24 * 10)
    expect(month?.chart.x).toHaveLength(30 * 24 + 1)
  })

  test('a thread device shows RSSI and has no LQI threshold', () => {
    const view = deviceView(env.context, idOf('Steckdose Terrasse'), '7d')
    expect(view?.protocol?.rawLabel).toBe('RSSI')
    expect(view?.weakRaw).toBeNull()
    expect(view?.current?.text).toMatch(/LQI \d · −\d+ dBm/)
  })

  test('an unknown device is null', () => {
    expect(deviceView(env.context, 99_999, '7d')).toBeNull()
  })
})

describe('network', () => {
  test('the zigbee map: every device placed, one edge per pair, the root in the middle', () => {
    const view = networkView(env.context, 'zigbee', null, null)
    expect(view.nodes).toHaveLength(9)
    const root = view.nodes.find((n) => n.root)
    expect(root?.name).toBe('Koordinator')
    const pairs = view.edges.map((e) => [e.a, e.b].sort().join('-'))
    expect(new Set(pairs).size).toBe(pairs.length)
    expect(view.edges.filter((e) => e.parent)).toHaveLength(8)
    expect(view.snapshots.length).toBeGreaterThan(20)
    expect(view.canRequest).toBe(true)
  })

  test('the selected device shows its parent, link and hops', () => {
    const id = idOf('Temperatursensor Keller')
    const view = networkView(env.context, 'zigbee', null, id)
    expect(view.selected).toMatchObject({
      name: 'Temperatursensor Keller',
      parent: 'Steckdose Waschküche',
      hops: 2,
    })
    expect(view.selected?.parentLink).toMatch(/^\d+$/)
  })

  test('an old snapshot shows the old parent', () => {
    const id = idOf('Temperatursensor Keller')
    const first = networkView(env.context, 'zigbee', null, null).snapshots[0]
    const view = networkView(env.context, 'zigbee', first?.id ?? null, id)
    expect(view.snapshot?.id).toBe(first?.id)
    expect(view.selected?.parent).toBe('Steckdose Wohnzimmer')
  })

  test('an offline device makes its edges offline', () => {
    const view = networkView(env.context, 'zigbee', null, null)
    const garage = view.nodes.find((n) => n.name === 'Türsensor Garage')
    const edge = view.edges.find((e) => e.a === garage?.id || e.b === garage?.id)
    expect(edge?.quality).toBe('offline')
  })

  test('the thread map has the border router as root and two-part labels', () => {
    const view = networkView(env.context, 'thread', null, null)
    expect(view.nodes.find((n) => n.root)?.name).toBe('Border Router')
    expect(view.edges.find((e) => e.parent)?.label).toMatch(/^\d · −\d+$/)
  })

  test('an unknown protocol is an empty map', () => {
    const view = networkView(env.context, 'zwave', null, null)
    expect(view.nodes).toEqual([])
    expect(view.protocol).toBe('zwave')
    expect(view.canRequest).toBe(false)
  })
})
