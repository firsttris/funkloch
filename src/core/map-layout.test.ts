import { describe, expect, test } from 'vitest'
import { footprint, layout, MIN_HEIGHT, MIN_WIDTH, type Positioned } from './map-layout'
import { type MapLink, type MapNode, mapEdges } from './topology'

const score = ({ lqi }: { lqi: number | null }) =>
  lqi === null ? null : Math.round((lqi / 255) * 100)

const ROOMS = ['Keller Waschküche', 'OG Kinderzimmer', 'EG Esszimmer', 'Garage Licht', 'OG Anbau']
const KINDS = ['Wandtaster', 'Rauchmelder', 'Bewegungsmelder']

/**
 * A home network like the ones the map has to draw: a coordinator, every fifth device a router,
 * long names, the last `loose` devices without any link.
 */
const network = (size: number, loose = 0) => {
  const nodes: MapNode[] = [{ id: 1, name: 'Koordinator', role: 'coordinator', status: 'unknown' }]
  const links: MapLink[] = []
  const routers = [1]
  for (let id = 2; id <= size; id++) {
    const router = id % 5 === 0
    const kind = router ? 'Steckdose' : KINDS[id % KINDS.length]
    const name = `${kind} - ${ROOMS[(id * 7) % ROOMS.length]} ${id}`
    nodes.push({ id, name, role: router ? 'router' : 'end_device', status: 'good' })
    if (id > size - loose) continue
    const parent = routers[(id * 3) % routers.length] as number
    links.push({ from: id, to: parent, lqi: 150, rssi: null, parent: true })
    if (router) {
      for (const other of routers.filter((r) => r !== parent && (r + id) % 3 === 0))
        links.push({ from: id, to: other, lqi: 90, rssi: null, parent: false })
      routers.push(id)
    }
  }
  return { nodes, edges: mapEdges(links, score, new Set()) }
}

/** Pairs of devices whose circles or names overlap, margins aside */
const overlaps = (nodes: readonly MapNode[], positions: readonly Positioned[]) => {
  const at = new Map(positions.map((p) => [p.id, p]))
  const pairs: string[] = []
  for (const [i, a] of nodes.entries()) {
    for (const b of nodes.slice(i + 1)) {
      const pa = at.get(a.id)
      const pb = at.get(b.id)
      if (!pa || !pb) continue
      const fa = footprint(a)
      const fb = footprint(b)
      const [upper, lower, fu, fl] = pa.y <= pb.y ? [pa, pb, fa, fb] : [pb, pa, fb, fa]
      const x = fa.half + fb.half - 16 - Math.abs(pa.x - pb.x)
      const y = fu.below + fl.above - 16 - (lower.y - upper.y)
      if (x > 0 && y > 0) pairs.push(`${a.name} / ${b.name}`)
    }
  }
  return pairs
}

describe('layout', () => {
  test('no two devices or their names overlap, however large the network', () => {
    for (const size of [5, 30, 60, 120]) {
      const { nodes, edges } = network(size, 4)
      expect(overlaps(nodes, layout(nodes, edges).positions)).toEqual([])
    }
  })

  test('a large network makes the drawing larger instead of squeezing it', () => {
    const { nodes, edges } = network(60)
    const map = layout(nodes, edges)
    expect(map.width).toBeGreaterThan(MIN_WIDTH)
    expect(map.height).toBeGreaterThan(MIN_HEIGHT)
    for (const p of map.positions) {
      const box = footprint(nodes.find((n) => n.id === p.id) as MapNode)
      expect(p.x - box.half).toBeGreaterThanOrEqual(0)
      expect(p.x + box.half).toBeLessThanOrEqual(map.width)
      expect(p.y - box.above).toBeGreaterThanOrEqual(0)
      expect(p.y + box.below).toBeLessThanOrEqual(map.height)
    }
  })

  test('a small network keeps the smallest drawing, the root in its middle', () => {
    const { nodes, edges } = network(4)
    const map = layout(nodes, edges)
    expect(map).toMatchObject({ width: MIN_WIDTH, height: MIN_HEIGHT })
    expect(map.positions.find((p) => p.id === 1)?.x).toBe(MIN_WIDTH / 2)
  })

  test('devices without a link sit in rows under the linked ones', () => {
    const { nodes, edges } = network(30, 6)
    const map = layout(nodes, edges)
    const loose = new Set(nodes.slice(-6).map((n) => n.id))
    const lowestLinked = Math.max(...map.positions.filter((p) => !loose.has(p.id)).map((p) => p.y))
    for (const p of map.positions.filter((p) => loose.has(p.id))) {
      expect(p.y).toBeGreaterThan(lowestLinked)
    }
  })

  test('is deterministic', () => {
    const { nodes, edges } = network(30, 2)
    expect(layout(nodes, edges)).toEqual(layout([...nodes].reverse(), edges))
  })

  test('handles no nodes and a single node', () => {
    expect(layout([], [])).toEqual({ width: MIN_WIDTH, height: MIN_HEIGHT, positions: [] })
    const root: MapNode = { id: 1, name: 'Koordinator', role: 'coordinator', status: 'unknown' }
    const [only] = layout([root], []).positions
    expect(only?.x).toBe(MIN_WIDTH / 2)
    expect(Math.abs((only?.y ?? 0) - MIN_HEIGHT / 2)).toBeLessThan(20)
  })
})
