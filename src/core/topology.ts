// The network map as data: nodes, deduplicated edges, hops to the root and a force layout.
// d3-force only computes positions; drawing is the UI's job.
import { forceCollide, forceLink, forceManyBody, forceSimulation, forceX, forceY } from 'd3-force'
import { band } from './score'
import type { Band, Role, Status } from './types'

export type MapNode = { id: number; name: string; role: Role; status: Status }

export type MapLink = {
  from: number
  to: number
  lqi: number | null
  rssi: number | null
  /** `to` is the parent of `from` */
  parent: boolean
}

export type MapEdge = {
  /** Child (for a parent edge) or the lower id */
  a: number
  b: number
  parent: boolean
  lqi: number | null
  rssi: number | null
  /** Band of the link score; null without a value or when an end is offline */
  quality: Band | 'offline' | null
}

const ROOT_ROLES: Role[] = ['coordinator', 'border_router']
export const isRoot = (role: Role) => ROOT_ROLES.includes(role)

/**
 * One edge per pair of devices. A parent link wins over a neighbor link of the same pair; of two
 * values the weaker counts, since a link is only as good as its worse direction.
 */
export const mapEdges = (
  links: readonly MapLink[],
  linkScore: (link: { lqi: number | null; rssi: number | null }) => number | null,
  offline: ReadonlySet<number>,
): MapEdge[] => {
  const byPair = new Map<string, MapLink>()
  for (const link of links) {
    if (link.from === link.to) continue
    const key = link.from < link.to ? `${link.from}-${link.to}` : `${link.to}-${link.from}`
    const existing = byPair.get(key)
    if (!existing) {
      byPair.set(key, link)
      continue
    }
    const weaker = (linkScore(link) ?? 101) < (linkScore(existing) ?? 101) ? link : existing
    const parent = link.parent ? link : existing.parent ? existing : null
    byPair.set(key, {
      from: parent?.from ?? existing.from,
      to: parent?.to ?? existing.to,
      parent: parent !== null,
      lqi: weaker.lqi,
      rssi: weaker.rssi,
    })
  }
  return [...byPair.values()].map((link) => {
    const score = linkScore(link)
    const down = offline.has(link.from) || offline.has(link.to)
    return {
      a: link.from,
      b: link.to,
      parent: link.parent,
      lqi: link.lqi,
      rssi: link.rssi,
      quality: down ? 'offline' : score === null ? null : band(score),
    }
  })
}

/** Hops from a device to the coordinator or border router along its parents; null if no path. */
export const hopsToRoot = (id: number, edges: readonly MapEdge[], roots: ReadonlySet<number>) => {
  const parents = new Map(edges.filter((e) => e.parent).map((e) => [e.a, e.b]))
  const seen = new Set<number>()
  let current = id
  let hops = 0
  while (!roots.has(current)) {
    const next = parents.get(current)
    if (next === undefined || seen.has(current)) return null
    seen.add(current)
    current = next
    hops++
  }
  return hops
}

export type Positioned = { id: number; x: number; y: number }

type SimNode = {
  id: number
  x?: number
  y?: number
  fx?: number | null
  fy?: number | null
  root: boolean
}

/**
 * Start positions as a radial tree: every root in the middle, each subtree gets a slice of the
 * circle as wide as its number of leaves, one ring per hop. Devices without a parent hang off the
 * middle as well. A good start keeps parents and children on the same side.
 */
export const radialTree = (nodes: readonly MapNode[], edges: readonly MapEdge[], ring = 160) => {
  const ids = new Set(nodes.map((n) => n.id))
  const roots = new Set(nodes.filter((n) => isRoot(n.role)).map((n) => n.id))
  const parentOf = new Map(
    edges.filter((e) => e.parent && ids.has(e.a) && ids.has(e.b)).map((e) => [e.a, e.b]),
  )
  const children = new Map<number | null, number[]>()
  for (const node of [...nodes].sort((a, b) => a.id - b.id)) {
    if (roots.has(node.id)) continue
    const parent = parentOf.get(node.id)
    const key = parent !== undefined && !roots.has(parent) ? parent : null
    children.set(key, [...(children.get(key) ?? []), node.id])
  }
  const leaves = (id: number | null, seen: Set<number | null>): number => {
    if (seen.has(id)) return 1
    seen.add(id)
    const kids = children.get(id) ?? []
    return kids.length === 0 ? 1 : kids.reduce((sum, kid) => sum + leaves(kid, seen), 0)
  }
  const positions = new Map<number, { x: number; y: number }>()
  for (const root of roots) positions.set(root, { x: 0, y: 0 })
  const place = (
    id: number | null,
    from: number,
    to: number,
    depth: number,
    seen: Set<number | null>,
  ) => {
    if (seen.has(id)) return
    seen.add(id)
    if (id !== null) {
      const angle = (from + to) / 2
      positions.set(id, { x: Math.cos(angle) * ring * depth, y: Math.sin(angle) * ring * depth })
    }
    const kids = children.get(id) ?? []
    const total = kids.reduce((sum, kid) => sum + leaves(kid, new Set()), 0)
    let start = from
    for (const kid of kids) {
      const span = ((to - from) * leaves(kid, new Set())) / Math.max(total, 1)
      place(kid, start, start + span, depth + 1, seen)
      start += span
    }
  }
  place(null, -Math.PI / 2, (3 * Math.PI) / 2, 0, new Set())
  return positions
}

type SimLink = { source: number; target: number; parent: boolean }

/**
 * Positions in a width × height box with the root in the middle: the radial tree as a start,
 * then d3-force untangles it (parents pull their children close, neighbor links a little).
 * Deterministic: same input, same picture (d3-force uses a seeded random source).
 */
export const layout = (
  nodes: readonly MapNode[],
  edges: readonly MapEdge[],
  width = 900,
  height = 580,
  padding = 70,
): Positioned[] => {
  if (nodes.length === 0) return []
  const start = radialTree(nodes, edges)
  const sim: SimNode[] = [...nodes]
    .sort((a, b) => a.id - b.id)
    .map((node) => {
      const root = isRoot(node.role)
      const p = start.get(node.id) ?? { x: 0, y: 0 }
      return { id: node.id, root, x: p.x, y: p.y, ...(root ? { fx: 0, fy: 0 } : {}) }
    })
  const ids = new Set(sim.map((n) => n.id))
  const simLinks: SimLink[] = edges
    .filter((e) => ids.has(e.a) && ids.has(e.b))
    .map((e) => ({ source: e.a, target: e.b, parent: e.parent }))

  forceSimulation(sim)
    .force(
      'link',
      forceLink<SimNode, SimLink>(simLinks)
        .id((n) => n.id)
        .distance((l) => (l.parent ? 170 : 280))
        .strength((l) => (l.parent ? 0.9 : 0.02)),
    )
    .force('charge', forceManyBody().strength(-1400))
    .force('collide', forceCollide(80))
    .force('x', forceX(0).strength(0.04))
    .force('y', forceY(0).strength(0.06))
    .stop()
    .tick(400)

  // Scale around the middle, so the root stays centred; labels need more room sideways
  const padX = padding + 40
  const maxX = Math.max(1, ...sim.map((n) => Math.abs(n.x ?? 0)))
  const maxY = Math.max(1, ...sim.map((n) => Math.abs(n.y ?? 0)))
  const scale = Math.min((width / 2 - padX) / maxX, (height / 2 - padding) / maxY, 2)
  return sim.map((n) => ({
    id: n.id,
    x: Math.round(width / 2 + (n.x ?? 0) * scale),
    y: Math.round(height / 2 + (n.y ?? 0) * scale),
  }))
}
