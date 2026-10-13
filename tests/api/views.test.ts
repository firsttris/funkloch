// Ebene 5: the views behind the server functions, on a seeded database
import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { deviceView } from '~/server/views/device'
import { eventsCsv, eventsView } from '~/server/views/events'
import { heatmapView } from '~/server/views/heatmap'
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

  test('the newest energy scan, with the networks on their quiet channels', () => {
    const channels = overviewView(env.context, '24h').channels
    expect(channels?.ts).toBe(env.context.now - 10 * 60_000)
    expect(channels?.bars).toHaveLength(16)
    expect(channels?.networks).toEqual([
      { protocol: 'zigbee', label: 'Zigbee', channel: 15 },
      { protocol: 'thread', label: 'Thread', channel: 25 },
    ])
    const network = channels?.bars.filter((b) => b.network !== null)
    expect(network?.map((b) => [b.channel, b.busy])).toEqual([
      [15, false],
      [25, false],
    ])
    expect(channels?.bars.find((b) => b.channel === 17)?.busy).toBe(true)
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
    expect(view?.events.map((e) => e.type)).toEqual([
      'signal_weak',
      'trend_down',
      'parent_changed',
      'online',
      'offline',
      'parent_changed',
    ])
    expect(view?.events[0]?.details).toMatchObject({ threshold: 'LQI 64' })
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

describe('events', () => {
  test('lists the demo events, newest first, with counts per kind', () => {
    const view = eventsView(env.context, 'all', 30)
    expect(view.counts).toMatchObject({ all: 9, offline: 3, signal: 4, topology: 2, network: 0 })
    expect(view.events).toHaveLength(9)
    const times = view.events.map((e) => e.ts)
    expect(times).toEqual([...times].sort((a, b) => b - a))
    expect(view.events.find((e) => e.type === 'parent_changed')?.device).toBe(
      'Temperatursensor Keller',
    )
  })

  test('filters by kind and range', () => {
    expect(eventsView(env.context, 'topology', 30).events.every((e) => e.kind === 'topology')).toBe(
      true,
    )
    expect(eventsView(env.context, 'all', 7).events.length).toBeLessThanOrEqual(9)
  })

  test('the CSV has a header, one line per event and quotes JSON', () => {
    const csv = eventsCsv(env.context, 'all', 30)
    const lines = csv.trim().split('\n')
    expect(lines[0]).toBe('time,kind,type,protocol,device,address,details')
    expect(lines).toHaveLength(10)
    expect(csv).toContain('"{""from"":""Steckdose Wohnzimmer"",""to"":""Rollladen Schlafzimmer""}"')
  })
})

describe('heatmap', () => {
  test('one row per device with one cell per hour, worst first', () => {
    const view = heatmapView(env.context, 7)
    expect(view.rows).toHaveLength(13)
    for (const row of view.rows) expect(row.cells).toHaveLength(7 * 24)
    expect(view.rows[0]?.name).toBe('Türsensor Garage')
    expect(view.rows.at(-1)?.cells).toMatch(/^g+$/)
    expect(heatmapView(env.context, 30).rows[0]?.cells).toHaveLength(30 * 24)
  })

  test('the offline stretches show as o, the evening dips of the terrace as w', () => {
    const view = heatmapView(env.context, 7)
    const cellar = view.rows.find((r) => r.name === 'Temperatursensor Keller')
    expect(cellar?.cells).toMatch(/o{5,6}/)
    const terrace = view.rows.find((r) => r.name === 'Steckdose Terrasse')
    expect(terrace?.cells.match(/w+/g)?.length).toBeGreaterThanOrEqual(5)
  })

  test('the findings name the pattern, the falling trends and the outage', () => {
    const { findings } = heatmapView(env.context, 7)
    expect(findings.patterns).toMatchObject([{ name: 'Steckdose Terrasse', from: 19, to: 23 }])
    expect(findings.falling.map((f) => f.name).sort()).toEqual([
      'Steckdose Terrasse',
      'Temperatursensor Keller',
    ])
    expect(findings.offline.map((f) => f.name)).toEqual(['Türsensor Garage'])
  })
})
