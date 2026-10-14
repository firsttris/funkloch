import { describe, expect, test } from 'vitest'
import { specNetwork } from './fake'
import { toNode } from './nodes'
import { borderRouterSchema, nodeSchema } from './schemas'
import {
  availabilityOf,
  cycleObservations,
  threadChannel,
  threadCounters,
  threadFromNodes,
  wifiFromNodes,
} from './translate'

const spec = specNetwork()
const nodes = spec.nodes.map((n) => toNode(nodeSchema.parse(n)))
const routers = spec.borderRouters.map((r) => borderRouterSchema.parse(r))
const TS = 1_760_400_000_000

const N1 = '1111111111111111'
const N2 = '2222222222222222'
const N3 = '3333333333333333'
const BR = 'aa00000000000001'
const OTHER = '4444444444444444'

describe('threadFromNodes', () => {
  const thread = threadFromNodes(nodes, routers, TS)

  test('the nodes, the border router found over mDNS and a child of another controller', () => {
    expect(thread.devices.map((d) => [d.address, d.name, d.role])).toEqual([
      [N1, 'Kaffeemaschine', 'router'],
      [N2, 'NL67', 'router'],
      [N3, 'Eve Door', 'sleepy_end_device'],
      [BR, 'Wohnzimmer', 'border_router'],
      [OTHER, OTHER, 'end_device'],
    ])
    expect(thread.devices.find((d) => d.address === BR)).toMatchObject({
      vendor: 'Apple Inc.',
      model: 'AppleTV14,1',
    })
  })

  test('a child as its parent hears it, a router by the best of the routers that hear it', () => {
    const readings = Object.fromEntries(
      thread.measurements.map((m) => [m.address, [m.rssi, m.lqi, m.score]]),
    )
    expect(readings).toEqual({
      [N1]: [-71, 2, 58],
      [N2]: [-70, 2, 59],
      [N3]: [-78, 2, 44],
      [OTHER]: [-86, 1, 24],
    })
    expect(thread.measurements.find((m) => m.address === N3)?.battery).toBe(85)
  })

  test('children hang on their parent, routers get an uplink towards the border router', () => {
    const parents = thread.links.filter((l) => l.parent).map((l) => [l.from, l.to])
    expect(parents).toEqual(
      expect.arrayContaining([
        [N3, N1],
        [OTHER, N1],
        [N1, BR],
      ]),
    )
    expect(parents.find(([from]) => from === BR)).toBeUndefined()
  })
})

describe('wifiFromNodes', () => {
  test('the station with its RSSI, under its access point named by SSID', () => {
    const wifi = wifiFromNodes(nodes, TS)
    expect(wifi.devices.map((d) => [d.address, d.name, d.role])).toEqual([
      ['aa:bb:cc:00:11:22', 'Waschmaschine', 'end_device'],
      ['11:22:33:44:55:66', 'Heimnetz · 55:66', 'access_point'],
    ])
    expect(wifi.measurements).toMatchObject([{ rssi: -61, raw: -61, lqi: null, score: 73 }])
    expect(wifi.links).toEqual([
      { from: 'aa:bb:cc:00:11:22', to: '11:22:33:44:55:66', lqi: null, rssi: -61, parent: true },
    ])
  })
})

describe('counters, channel and reachability', () => {
  test('from the attributes the nodes have', () => {
    expect(threadCounters(nodes, TS)).toEqual([
      { protocol: 'thread', address: N1, ts: TS, unicast: 5120, broadcast: 830, errors: 41 },
    ])
    expect(threadChannel(nodes)).toBe(15)
    expect(availabilityOf(nodes.slice(1, 2).map((n) => ({ ...n, available: false })))).toEqual([
      { protocol: 'thread', address: N2, online: false },
    ])
    expect(availabilityOf(nodes)).toHaveLength(4)
  })
})

describe('cycleObservations', () => {
  const kinds = (observations: ReturnType<typeof cycleObservations>, protocol: string) =>
    observations
      .filter((o) =>
        o.kind === 'measurement'
          ? o.measurement.protocol === protocol
          : o.kind === 'topology'
            ? o.topology.protocol === protocol
            : o.kind === 'counters'
              ? o.counters.protocol === protocol
              : 'protocol' in o && o.protocol === protocol,
      )
      .map((o) => o.kind)

  test('with the Thread signal: devices, readings, map, counters and channel', () => {
    const all = cycleObservations(nodes, routers, TS, true)
    expect(new Set(kinds(all, 'thread'))).toEqual(
      new Set(['devices', 'measurement', 'topology', 'counters', 'channel']),
    )
    expect(new Set(kinds(all, 'wifi'))).toEqual(new Set(['devices', 'measurement', 'topology']))
  })

  test('while the OTBR measures Thread: only the Thread devices, with what Matter knows best', () => {
    const all = cycleObservations(nodes, routers, TS, false)
    expect(kinds(all, 'thread')).toEqual(['devices'])
    const list = all.find((o) => o.kind === 'devices' && o.protocol === 'thread')
    expect(list).toMatchObject({ source: { id: 'matter' }, complete: false })
  })
})
