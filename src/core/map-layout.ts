// Positions for the network map. d3-force only computes positions; drawing is the UI's job, but
// the layout knows how much room a device takes there (its circle and the name under it), so that
// no two devices and their names overlap however large the network is.
import { forceLink, forceManyBody, forceSimulation, forceX, forceY } from 'd3-force'
import { isRoot, type MapEdge, type MapNode, radialTree } from './topology'
import type { Role } from './types'

export type Positioned = { id: number; x: number; y: number }

/** The positions and the size of the drawing they need */
export type MapLayout = { width: number; height: number; positions: Positioned[] }

/** Smallest drawing: a small network keeps the proportions of the card */
export const MIN_WIDTH = 900
export const MIN_HEIGHT = 580
const PADDING = 40

/** The circle radius the map draws for a device (components/network-graph.tsx) */
export const nodeRadius = (role: Role) => (isRoot(role) ? 28 : role === 'router' ? 22 : 13)

/** Roles that get a second line with the role under the name */
export const ROLE_LINE: Role[] = ['router', 'router_eligible', 'sleepy_end_device']

/** Width of a name in the map's 13 px font; generous, a wide guess only costs some room */
const textWidth = (text: string) => text.length * 7.6

/**
 * The room a device takes around its centre: the circle, the name below it and, for some roles,
 * a second line. Half width, and the extent above and below the centre.
 */
export const footprint = (node: MapNode) => {
  const r = nodeRadius(node.role)
  return {
    half: Math.max(r, textWidth(node.name) / 2) + 8,
    above: r + 8,
    below: r + (ROLE_LINE.includes(node.role) ? 40 : 26),
  }
}

type Box = ReturnType<typeof footprint>

type SimNode = { id: number; x: number; y: number; fx?: number; fy?: number; box: Box }
type SimLink = { source: number | SimNode; target: number | SimNode; parent: boolean }

/** Room for both names and the value between them, so the value can sit on the line freely */
const parentDistance = (link: SimLink) => {
  const half = (end: number | SimNode) => (typeof end === 'object' ? end.box.half : 0)
  return Math.max(170, half(link.source) + half(link.target) + 60)
}

/** How far two boxes overlap on each axis; positive on both means they collide */
const overlap = (a: SimNode, b: SimNode) => ({
  x: a.box.half + b.box.half - Math.abs(a.x - b.x),
  y: a.y < b.y ? a.box.below + b.box.above - (b.y - a.y) : b.box.below + a.box.above - (a.y - b.y),
})

/**
 * Pushes overlapping boxes apart along the axis where they overlap least. A fixed node (the root)
 * does not move; the other one takes the whole step.
 */
const separate = (nodes: SimNode[], strength: number) => {
  let moved = false
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i] as SimNode
      const b = nodes[j] as SimNode
      const o = overlap(a, b)
      if (o.x <= 0 || o.y <= 0) continue
      moved = true
      // Sideways even when that overlap is somewhat larger: the map stays wide like its card
      const alongX = o.x < o.y * 2.5
      const step = (alongX ? o.x : o.y) * strength
      const sign = alongX
        ? Math.sign(b.x - a.x || b.id - a.id)
        : Math.sign(b.y - a.y || b.id - a.id)
      const share = a.fx !== undefined ? [0, 1] : b.fx !== undefined ? [1, 0] : [0.5, 0.5]
      if (alongX) {
        a.x -= sign * step * (share[0] ?? 0)
        b.x += sign * step * (share[1] ?? 0)
      } else {
        a.y -= sign * step * (share[0] ?? 0)
        b.y += sign * step * (share[1] ?? 0)
      }
    }
  }
  return moved
}

/** d3-force custom force: boxes push each other apart while the simulation runs */
const boxCollide = (nodes: SimNode[]) => {
  const force = (alpha: number) => {
    separate(nodes, Math.min(1, 0.3 + alpha))
  }
  force.initialize = () => {}
  return force
}

/** Devices without any link: they sit in rows under the map instead of drifting off */
const placeLoose = (loose: readonly MapNode[], top: number, width: number): Positioned[] => {
  const placed: Positioned[] = []
  let x = PADDING
  let y = top
  let rowHeight = 0
  for (const node of [...loose].sort((a, b) => a.name.localeCompare(b.name))) {
    const box = footprint(node)
    if (x + 2 * box.half > width - PADDING && x > PADDING) {
      x = PADDING
      y += rowHeight
      rowHeight = 0
    }
    placed.push({ id: node.id, x: Math.round(x + box.half), y: Math.round(y + box.above) })
    x += 2 * box.half
    rowHeight = Math.max(rowHeight, box.above + box.below)
  }
  return placed
}

/**
 * The map: the radial tree as a start, then d3-force untangles it (parents pull their children
 * close, neighbor links a little) while no two devices with their names overlap. Positions are in
 * pixels of a drawing that grows with the network instead of squeezing it; the root sits in the
 * middle of the linked part. Deterministic: same input, same picture.
 */
export const layout = (nodes: readonly MapNode[], edges: readonly MapEdge[]): MapLayout => {
  const linked = new Set(edges.flatMap((e) => [e.a, e.b]))
  const sorted = [...nodes].sort((a, b) => a.id - b.id)
  const main = sorted.filter((n) => linked.has(n.id) || isRoot(n.role))
  const loose = sorted.filter((n) => !linked.has(n.id) && !isRoot(n.role))

  const start = radialTree(main, edges)
  const sim: SimNode[] = main.map((node) => {
    const p = start.get(node.id) ?? { x: 0, y: 0 }
    const root = isRoot(node.role)
    return { id: node.id, x: p.x, y: p.y, box: footprint(node), ...(root ? { fx: 0, fy: 0 } : {}) }
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
        .distance((l) => (l.parent ? parentDistance(l) : 280))
        .strength((l) => (l.parent ? 0.7 : 0.02)),
    )
    .force('charge', forceManyBody().strength(-500))
    .force('boxes', boxCollide(sim))
    .force('x', forceX(0).strength(0.03))
    .force('y', forceY(0).strength(0.12))
    .stop()
    .tick(300)
  // The forces settle near, not at, a picture without overlaps; this finishes the job
  for (let i = 0; i < 500 && separate(sim, 1); i++);

  const left = Math.min(0, ...sim.map((n) => n.x - n.box.half))
  const right = Math.max(0, ...sim.map((n) => n.x + n.box.half))
  const top = Math.min(0, ...sim.map((n) => n.y - n.box.above))
  const bottom = Math.max(0, ...sim.map((n) => n.y + n.box.below))
  // Room on both sides of the root, so it stays in the middle
  const halfWidth = Math.max(-left, right)
  const width = Math.max(MIN_WIDTH, Math.ceil(2 * halfWidth + 2 * PADDING))
  const mainHeight = Math.max(MIN_HEIGHT, Math.ceil(bottom - top + 2 * PADDING))
  const offsetY = (mainHeight - (bottom - top)) / 2 - top
  const positioned = sim.map((n) => ({
    id: n.id,
    x: Math.round(width / 2 + n.x),
    y: Math.round(offsetY + n.y),
  }))
  const extra = placeLoose(loose, mainHeight, width)
  const looseBottom = Math.max(
    0,
    ...loose.map((n) => {
      const p = extra.find((e) => e.id === n.id)
      return (p?.y ?? 0) + footprint(n).below
    }),
  )
  return {
    width,
    height: loose.length > 0 ? Math.ceil(looseBottom + PADDING) : mainHeight,
    positions: [...positioned, ...extra],
  }
}
