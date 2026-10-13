import { describe, expect, test } from 'vitest'
import { hopsToRoot, layout, type MapNode, mapEdges, radialTree } from './topology'

const score = ({ lqi }: { lqi: number | null }) =>
  lqi === null ? null : Math.round((lqi / 255) * 100)

describe('mapEdges', () => {
  test('one edge per pair, the parent direction wins, the weaker value counts', () => {
    const edges = mapEdges(
      [
        { from: 2, to: 1, lqi: 200, rssi: null, parent: true },
        { from: 1, to: 2, lqi: 120, rssi: null, parent: false },
        { from: 3, to: 2, lqi: 40, rssi: null, parent: false },
      ],
      score,
      new Set(),
    )
    expect(edges).toEqual([
      { a: 2, b: 1, parent: true, lqi: 120, rssi: null, quality: 'mid' },
      { a: 3, b: 2, parent: false, lqi: 40, rssi: null, quality: 'weak' },
    ])
  })

  test('an edge to an offline device is offline, one without value has no quality', () => {
    const edges = mapEdges(
      [
        { from: 2, to: 1, lqi: 200, rssi: null, parent: true },
        { from: 3, to: 1, lqi: null, rssi: null, parent: true },
      ],
      score,
      new Set([2]),
    )
    expect(edges.map((e) => e.quality)).toEqual(['offline', null])
  })

  test('ignores links to itself', () => {
    expect(
      mapEdges([{ from: 1, to: 1, lqi: 1, rssi: null, parent: true }], score, new Set()),
    ).toEqual([])
  })
})

describe('hopsToRoot', () => {
  const edges = mapEdges(
    [
      { from: 3, to: 2, lqi: 100, rssi: null, parent: true },
      { from: 2, to: 1, lqi: 100, rssi: null, parent: true },
      { from: 4, to: 5, lqi: 100, rssi: null, parent: true },
      { from: 5, to: 4, lqi: 100, rssi: null, parent: false },
    ],
    score,
    new Set(),
  )

  test('counts parents up to the root', () => {
    expect(hopsToRoot(3, edges, new Set([1]))).toBe(2)
    expect(hopsToRoot(1, edges, new Set([1]))).toBe(0)
  })

  test('is null without a path', () => {
    expect(hopsToRoot(4, edges, new Set([1]))).toBeNull()
  })
})

describe('layout', () => {
  const nodes: MapNode[] = [
    { id: 1, name: 'Koordinator', role: 'coordinator', status: 'unknown' },
    { id: 2, name: 'Router', role: 'router', status: 'good' },
    { id: 3, name: 'Sensor', role: 'end_device', status: 'weak' },
    { id: 4, name: 'Allein', role: 'end_device', status: 'offline' },
  ]
  const edges = mapEdges(
    [
      { from: 2, to: 1, lqi: 200, rssi: null, parent: true },
      { from: 3, to: 2, lqi: 40, rssi: null, parent: true },
    ],
    score,
    new Set(),
  )

  test('keeps every node inside the box, the root in the middle', () => {
    const positions = layout(nodes, edges, 900, 580, 70)
    expect(positions).toHaveLength(4)
    for (const p of positions) {
      expect(p.x).toBeGreaterThanOrEqual(70)
      expect(p.x).toBeLessThanOrEqual(830)
      expect(p.y).toBeGreaterThanOrEqual(70)
      expect(p.y).toBeLessThanOrEqual(510)
    }
  })

  test('the root sits exactly in the middle', () => {
    expect(layout(nodes, edges).find((p) => p.id === 1)).toEqual({ id: 1, x: 450, y: 290 })
  })

  test('the radial start puts a child further out than its parent, on its side', () => {
    const start = radialTree(nodes, edges)
    const router = start.get(2)
    const sensor = start.get(3)
    expect(Math.hypot(sensor?.x ?? 0, sensor?.y ?? 0)).toBeGreaterThan(
      Math.hypot(router?.x ?? 0, router?.y ?? 0),
    )
    expect(Math.sign(sensor?.x ?? 0)).toBe(Math.sign(router?.x ?? 0))
  })

  test('is deterministic', () => {
    expect(layout(nodes, edges)).toEqual(layout([...nodes].reverse(), edges))
  })

  test('handles no nodes and a single node', () => {
    expect(layout([], [])).toEqual([])
    expect(layout([nodes[0] as MapNode], [])).toEqual([{ id: 1, x: 450, y: 290 }])
  })
})
