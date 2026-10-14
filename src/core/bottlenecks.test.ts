import { describe, expect, test } from 'vitest'
import { bottlenecks } from './bottlenecks'
import type { MapLink } from './topology'
import type { Role } from './types'

const score = ({ lqi }: { lqi: number | null }) =>
  lqi === null ? null : Math.round((lqi / 255) * 100)
const link = (from: number, to: number, lqi: number, parent = false): MapLink => ({
  from,
  to,
  lqi,
  rssi: null,
  parent,
})

// 1 coordinator; 2 the cellar socket, 55/35 to the coordinator; 3 a socket that hangs on 2;
// 10–29 sensors: 12 on 2, 8 on 3; 4 a socket upstairs with a strong link and 2 sensors (30, 31)
const nodes: { id: number; role: Role }[] = [
  { id: 1, role: 'coordinator' },
  { id: 2, role: 'router' },
  { id: 3, role: 'router' },
  { id: 4, role: 'router' },
  ...Array.from({ length: 22 }, (_, i) => ({ id: 10 + i, role: 'end_device' as Role })),
]
const links: MapLink[] = [
  link(2, 1, 35, true),
  link(1, 2, 55),
  link(3, 2, 180, true),
  link(2, 3, 170),
  link(4, 1, 200, true),
  link(1, 4, 190),
  ...Array.from({ length: 12 }, (_, i) => link(10 + i, 2, 120, true)),
  ...Array.from({ length: 8 }, (_, i) => link(22 + i, 3, 120, true)),
  link(30, 4, 40, true),
  link(31, 4, 150, true),
]

describe('bottlenecks', () => {
  test('the weak link from the cellar to the coordinator carries the whole cellar', () => {
    expect(bottlenecks({ nodes, links, linkScore: score, weak: 25 })).toEqual([
      {
        child: 2,
        parent: 1,
        devices: 22,
        link: { there: { lqi: 35, rssi: null }, back: { lqi: 55, rssi: null }, score: 14 },
      },
    ])
  })

  test('a weak sensor alone is no bottleneck, a strong link carrying many neither', () => {
    const found = bottlenecks({ nodes, links, linkScore: score, weak: 25 }).map((b) => b.child)
    expect(found).not.toContain(30)
    expect(found).not.toContain(3)
  })

  test('the weaker direction decides, the most devices come first', () => {
    const oneWay = links.map((l) => (l.from === 3 && l.to === 2 ? { ...l, lqi: 30 } : l))
    expect(
      bottlenecks({ nodes, links: oneWay, linkScore: score, weak: 25 }).map((b) => [
        b.child,
        b.devices,
      ]),
    ).toEqual([
      [2, 22],
      [3, 9],
    ])
  })

  test('the threshold of devices can be set', () => {
    expect(bottlenecks({ nodes, links, linkScore: score, weak: 25, minDevices: 1 })).toHaveLength(2)
    expect(bottlenecks({ nodes, links, linkScore: score, weak: 25, minDevices: 30 })).toEqual([])
  })
})
