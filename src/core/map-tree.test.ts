import { describe, expect, test } from 'vitest'
import { CLIENT_TILE, mapTree, SHOWN, signalBars, type TreeEdge, type TreeNode } from './map-tree'
import type { Status } from './types'

const node = (id: number, role: TreeNode['role'], status: Status = 'good'): TreeNode => ({
  id,
  name: `Gerät ${String(id).padStart(3, '0')}`,
  role,
  status,
})
const link = (a: number, b: number, quality: TreeEdge['quality'] = 'good'): TreeEdge => ({
  a,
  b,
  parent: true,
  quality,
})

/** A coordinator, every fifth device a router, the rest end devices spread over the routers */
const network = (size: number) => {
  const nodes: TreeNode[] = [node(1, 'coordinator', 'unknown')]
  const edges: TreeEdge[] = []
  const routers = [1]
  for (let id = 2; id <= size; id++) {
    const router = id % 5 === 0
    nodes.push(node(id, router ? 'router' : 'end_device', id % 7 === 0 ? 'weak' : 'good'))
    edges.push(link(id, routers[(id * 3) % routers.length] as number))
    if (router) routers.push(id)
  }
  return { nodes, edges }
}

/** The room a placed device takes: its tile and the text beside it */
const boxOf = (p: ReturnType<typeof mapTree>['placed'][number]) => ({
  left: p.x,
  right: p.x + (p.kind === 'client' ? 210 : p.tile + 12 + 160),
  top: p.y,
  bottom: p.y + p.tile,
})

describe('mapTree', () => {
  test('no two devices overlap, however large the network', () => {
    for (const size of [5, 30, 60, 150]) {
      const { nodes, edges } = network(size)
      const boxes = mapTree(nodes, edges, new Set(nodes.map((n) => n.id))).placed.map(boxOf)
      for (const [i, a] of boxes.entries())
        for (const b of boxes.slice(i + 1))
          expect(a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom).toBe(
            false,
          )
    }
  })

  test('the root on top, a router below its parent, its end devices below it', () => {
    const tree = mapTree(
      [node(1, 'coordinator'), node(2, 'router'), node(3, 'end_device')],
      [link(2, 1), link(3, 2)],
    )
    const at = new Map(tree.placed.map((p) => [p.id, p]))
    expect(at.get(1)?.kind).toBe('root')
    expect(at.get(2)?.y).toBeGreaterThan(at.get(1)?.y ?? 0)
    expect(at.get(3)).toMatchObject({ kind: 'client', tile: CLIENT_TILE, depth: 2 })
    expect(at.get(3)?.y).toBeGreaterThan(at.get(2)?.y ?? 0)
    expect(tree.lines.map((l) => l.id).sort()).toEqual([2, 3])
  })

  test('a long list folds, worst first, and unfolds on request', () => {
    const nodes = [
      node(1, 'coordinator'),
      ...[2, 3, 4, 5, 6, 7, 8].map((id) => node(id, 'end_device', id === 8 ? 'weak' : 'good')),
    ]
    const edges = nodes.slice(1).map((n) => link(n.id, 1))
    const folded = mapTree(nodes, edges)
    const shown = folded.placed.filter((p) => p.kind === 'client')
    expect(shown).toHaveLength(SHOWN)
    expect(shown[0]?.id).toBe(8)
    expect(folded.folded).toEqual([expect.objectContaining({ parent: 1, hidden: [5, 6, 7] })])
    const open = mapTree(nodes, edges, new Set([1]))
    expect(open.placed.filter((p) => p.kind === 'client')).toHaveLength(7)
    expect(open.folded).toEqual([])
  })

  test('one more than shown is shown, not folded into a single line', () => {
    const nodes = [node(1, 'coordinator'), ...[2, 3, 4, 5, 6].map((id) => node(id, 'end_device'))]
    const tree = mapTree(
      nodes,
      nodes.slice(1).map((n) => link(n.id, 1)),
    )
    expect(tree.folded).toEqual([])
  })

  test('devices without a way to the root sit in a list beside the tree', () => {
    const tree = mapTree(
      [node(1, 'coordinator'), node(2, 'end_device'), node(3, 'end_device'), node(4, 'router')],
      [link(2, 1), link(4, 4)],
    )
    expect(tree.loose).not.toBeNull()
    const loose = tree.placed.filter((p) => p.id === 3 || p.id === 4)
    expect(loose).toHaveLength(2)
    for (const p of loose) expect(p.x).toBeGreaterThanOrEqual(tree.loose?.x ?? 0)
    expect(tree.lines.map((l) => l.id)).toEqual([2])
  })

  test('a loop of parents does not hang and counts as no way', () => {
    const tree = mapTree(
      [node(1, 'coordinator'), node(2, 'router'), node(3, 'router')],
      [link(2, 3), link(3, 2)],
    )
    expect(tree.placed).toHaveLength(3)
    expect(tree.loose).not.toBeNull()
  })

  test('two border routers stand side by side', () => {
    const tree = mapTree(
      [node(1, 'border_router'), node(2, 'border_router'), node(3, 'router')],
      [link(3, 2)],
    )
    const roots = tree.placed.filter((p) => p.kind === 'root')
    expect(roots).toHaveLength(2)
    expect(roots[0]?.y).toBe(roots[1]?.y)
  })

  test('everything lies inside the drawing', () => {
    const { nodes, edges } = network(60)
    const tree = mapTree(nodes, edges)
    for (const b of tree.placed.map(boxOf)) {
      expect(b.left).toBeGreaterThanOrEqual(0)
      expect(b.top).toBeGreaterThanOrEqual(0)
      expect(b.right).toBeLessThanOrEqual(tree.width)
      expect(b.bottom).toBeLessThanOrEqual(tree.height)
    }
  })

  test('routers that do not fit side by side wrap into rows inside the width', () => {
    // A coordinator with six routers, each with an end device: about 1,900 px side by side
    const nodes = [
      node(1, 'coordinator'),
      ...[2, 3, 4, 5, 6, 7].map((id) => node(id, 'router')),
      ...[12, 13, 14, 15, 16, 17].map((id) => node(id, 'end_device')),
    ]
    const edges = [
      ...[2, 3, 4, 5, 6, 7].map((id) => link(id, 1)),
      ...[12, 13, 14, 15, 16, 17].map((id) => link(id, id - 10)),
    ]
    const wide = mapTree(nodes, edges)
    expect(wide.width).toBeGreaterThan(1200)
    for (const room of [1100, 760, 360]) {
      const tree = mapTree(nodes, edges, new Set(), room)
      expect(tree.width).toBeLessThanOrEqual(room)
      const routerRows = new Set(tree.placed.filter((p) => p.kind === 'router').map((p) => p.y))
      expect(routerRows.size).toBeGreaterThan(1)
      const boxes = tree.placed.map(boxOf)
      for (const [i, a] of boxes.entries())
        for (const b of boxes.slice(i + 1))
          expect(a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom).toBe(
            false,
          )
      for (const b of boxes) expect(b.right).toBeLessThanOrEqual(tree.width)
      // every device still has its line to its parent, the rows below the first one too
      expect(tree.lines.map((l) => l.id).sort((a, b) => a - b)).toEqual([
        2, 3, 4, 5, 6, 7, 12, 13, 14, 15, 16, 17,
      ])
    }
    // at phone width one router per row
    const phone = mapTree(nodes, edges, new Set(), 360)
    expect(new Set(phone.placed.filter((p) => p.kind === 'router').map((p) => p.y)).size).toBe(6)
  })

  test('a map that fits stays as it is, whatever width it is given', () => {
    const { nodes, edges } = network(30)
    const tree = mapTree(nodes, edges)
    expect(mapTree(nodes, edges, new Set(), tree.width)).toEqual(tree)
  })

  test('is deterministic', () => {
    const { nodes, edges } = network(40)
    expect(mapTree(nodes, edges)).toEqual(mapTree([...nodes].reverse(), [...edges].reverse()))
  })
})

describe('signalBars', () => {
  test('four bars for a strong link, one for a weak one, none without a value', () => {
    expect(signalBars(95)).toBe(4)
    expect(signalBars(60)).toBe(3)
    expect(signalBars(30)).toBe(2)
    expect(signalBars(3)).toBe(1)
    expect(signalBars(0)).toBe(1)
    expect(signalBars(null)).toBe(0)
  })
})
