import { describe, expect, test } from 'vitest'
import { routerFinding } from './router-finding'
import type { MapLink } from './topology'
import type { Link, Role } from './types'
import { withUplinks } from './uplinks'

const zigbeeScore = ({ lqi }: { lqi: number | null }) =>
  lqi === null ? null : Math.round((lqi / 255) * 100)

/**
 * The cellar of 2026-10-14: an ESP32-C6 router next to three sockets that already cover the
 * cellar, the coordinator upstairs. Each link is an entry in `to`'s table about `from`.
 */
const NODES: [string, string, Role][] = [
  ['c', 'Coordinator', 'coordinator'],
  ['esp', 'esp32c6-zigbee-router', 'router'],
  ['sauna', 'Steckdose Keller Sauna', 'router'],
  ['flur', 'Steckdose Keller Flur', 'router'],
  ['klein', 'Steckdose Keller Kleiner Raum', 'router'],
  ['spare', 'Steckdose Treppe', 'router'],
]
const both = (a: string, b: string, aHearsB: number, bHearsA: number): Link[] => [
  { from: a, to: b, lqi: bHearsA, rssi: null, parent: false },
  { from: b, to: a, lqi: aHearsB, rssi: null, parent: false },
]
const child = (name: string, parent: string): Link => ({
  from: name,
  to: parent,
  lqi: 120,
  rssi: null,
  parent: true,
})
const sensors = (parent: string, count: number) =>
  Array.from({ length: count }, (_, i) => child(`${parent}-${i}`, parent))

const cellar = (extra: Link[] = []) => {
  const raw = [
    ...both('esp', 'c', 64, 15),
    ...both('flur', 'c', 64, 15),
    ...both('klein', 'c', 55, 35),
    ...both('esp', 'sauna', 151, 140),
    ...both('esp', 'flur', 120, 118),
    ...both('esp', 'klein', 93, 100),
    ...both('sauna', 'klein', 200, 190),
    ...both('sauna', 'flur', 170, 160),
    ...both('flur', 'klein', 150, 145),
    ...sensors('klein', 9),
    ...sensors('sauna', 8),
    ...sensors('flur', 4),
    ...extra,
  ]
  const links = withUplinks(raw, new Set(['c']), zigbeeScore)
  const addresses = [
    ...new Set([...NODES.map(([a]) => a), ...links.flatMap((l) => [l.from, l.to])]),
  ]
  const idOf = (address: string) => addresses.indexOf(address) + 1
  const nodes = addresses.map((address) => {
    const known = NODES.find(([a]) => a === address)
    return {
      id: idOf(address),
      name: known?.[1] ?? address,
      role: known?.[2] ?? ('end_device' as Role),
    }
  })
  const mapLinks: MapLink[] = links.map((l) => ({ ...l, from: idOf(l.from), to: idOf(l.to) }))
  const finding = (address: string) =>
    routerFinding({ id: idOf(address), nodes, links: mapLinks, linkScore: zigbeeScore, weak: 25 })
  return { finding }
}

describe('routerFinding', () => {
  test('the ESP32-C6 in the cellar: unused, covered by the sockets, its way upstairs weak', () => {
    const esp = cellar().finding('esp')
    expect(esp).toMatchObject({
      children: 0,
      carried: 0,
      neighbors: 3,
      root: { name: 'Coordinator', role: 'coordinator' },
      advice: 'move_towards_root',
    })
    expect(esp.uplink).toMatchObject({
      name: 'Coordinator',
      root: true,
      there: { lqi: 15 },
      back: { lqi: 64 },
      score: 6,
      weak: true,
    })
    expect(esp.coveredBy.map((r) => [r.name, r.neighbor])).toEqual([
      ['Steckdose Keller Flur', true],
      ['Steckdose Keller Kleiner Raum', true],
      ['Steckdose Keller Sauna', true],
    ])
  })

  test('the socket that carries the cellar: the devices behind it count, not only its own', () => {
    const klein = cellar().finding('klein')
    // its nine sensors, the sauna socket hanging on it, and the sauna socket's eight
    expect(klein).toMatchObject({ children: 10, carried: 18, advice: 'strengthen_uplink' })
    expect(klein.uplink).toMatchObject({ name: 'Coordinator', score: 14, weak: true })
  })

  test('a router of the way is counted, a router aside is not', () => {
    const { finding } = cellar()
    expect(finding('flur')).toMatchObject({ children: 4, carried: 4 })
    expect(finding('sauna')).toMatchObject({ children: 8, carried: 8 })
  })

  test('a neighbor no other router hears as well leaves the router not covered', () => {
    // a sensor only the ESP hears, and only as a neighbor
    const esp = cellar(both('esp', 'lonely', 90, 90)).finding('esp')
    expect(esp.coveredBy).toEqual([])
    expect(esp.neighbors).toBe(4)
  })

  test('an unused router with a good way and covered neighbors stands by', () => {
    const { finding } = cellar([
      ...both('spare', 'c', 200, 210),
      ...both('spare', 'sauna', 120, 120),
    ])
    expect(finding('spare')).toMatchObject({ carried: 0, advice: 'reserve' })
    expect(finding('spare').uplink?.weak).toBe(false)
  })
})
