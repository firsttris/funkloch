import { describe, expect, test } from 'vitest'
import { focusOf, hopsToRoot, type MapNode, mapEdges, radialTree } from './topology'

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

describe('radialTree', () => {
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

  test('the radial start puts a child further out than its parent, on its side', () => {
    const start = radialTree(nodes, edges)
    const router = start.get(2)
    const sensor = start.get(3)
    expect(Math.hypot(sensor?.x ?? 0, sensor?.y ?? 0)).toBeGreaterThan(
      Math.hypot(router?.x ?? 0, router?.y ?? 0),
    )
    expect(Math.sign(sensor?.x ?? 0)).toBe(Math.sign(router?.x ?? 0))
  })
})

describe('focusOf', () => {
  const lines = [
    { a: 2, b: 1, parent: true },
    { a: 3, b: 2, parent: true },
    { a: 4, b: 3, parent: true },
    { a: 5, b: 1, parent: true },
    { a: 3, b: 5, parent: false },
  ]

  test('the device, its way to the root and its direct lines', () => {
    expect(focusOf(4, lines)).toEqual({
      nodes: new Set([4, 3, 2, 1]),
      lines: new Set(['4-3', '3-2', '2-1']),
    })
    expect(focusOf(3, lines)).toEqual({
      nodes: new Set([3, 2, 4, 5, 1]),
      lines: new Set(['3-2', '4-3', '3-5', '2-1']),
    })
  })

  test('a loop of parents ends', () => {
    const loop = [
      { a: 1, b: 2, parent: true },
      { a: 2, b: 1, parent: true },
    ]
    expect(focusOf(1, loop).nodes).toEqual(new Set([1, 2]))
  })
})
