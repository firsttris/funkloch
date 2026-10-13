// The network map as a tree, in the manner of the UniFi topology: the coordinator or border router
// on top, routers in levels below it, joined by elbow lines, and the end devices of each router as
// a list underneath. Pure: the same nodes, links and unfolded lists give the same picture, on the
// server and in the browser.
import { isRoot } from './topology'
import type { Band, Role, Status } from './types'

export type TreeNode = { id: number; name: string; role: Role; status: Status }
export type TreeEdge = { a: number; b: number; parent: boolean; quality: Band | 'offline' | null }

/** Tile sizes the map draws (components/network-tree*.tsx) */
export const ROOT_TILE = 68
export const ROUTER_TILE = 56
export const CLIENT_TILE = 34

const ROW = 46
const LEVEL_GAP = 70
const COL_GAP = 26
const LABEL_W = 160
const CLIENT_W = 210
const PADDING = 40
const LOOSE_HEAD = 30
/** A list longer than this folds after its first rows */
export const SHOWN = 4

export type Placed = {
  id: number
  /** Top left corner of the tile */
  x: number
  y: number
  tile: number
  kind: 'root' | 'router' | 'client'
  /** Hops to the root; devices without a way count one beyond the deepest */
  depth: number
  /** Place in its list, for the build-up animation */
  order: number
}

export type TreeLine = {
  /** The device the line leads from, to its parent */
  id: number
  d: string
  quality: TreeEdge['quality']
  depth: number
  order: number
}

export type Folded = { parent: number; x: number; y: number; hidden: number[] }

export type MapTree = {
  width: number
  height: number
  placed: Placed[]
  lines: TreeLine[]
  folded: Folded[]
  /** Where the devices without a way to the root start, under their heading */
  loose: { x: number; y: number } | null
}

const RANK: Record<Status, number> = { offline: 0, weak: 1, mid: 2, unknown: 3, good: 4 }
const INFRASTRUCTURE: Role[] = ['coordinator', 'border_router', 'router']

/** Signal bars 0–4 from a link score 0–100, as a phone shows reception */
export const signalBars = (score: number | null) =>
  score === null ? 0 : Math.max(1, Math.min(4, Math.ceil(score / 25)))

/** An elbow with round corners: down, across at `ym`, down again */
const elbow = (x1: number, y1: number, x2: number, y2: number, ym: number) => {
  if (Math.abs(x1 - x2) < 1) return `M${x1},${y1} V${y2}`
  const r = Math.min(10, Math.abs(x2 - x1) / 2)
  const s = x2 > x1 ? 1 : -1
  return `M${x1},${y1} V${ym - r} Q${x1},${ym} ${x1 + s * r},${ym} H${x2 - s * r} Q${x2},${ym} ${x2},${ym + r} V${y2}`
}

/** Hops along the parents to a root; null without a way (no parent, or a loop) */
const depthOf = (id: number, parentOf: Map<number, number>, roots: Set<number>) => {
  const seen = new Set<number>()
  let current = id
  let hops = 0
  while (!roots.has(current)) {
    const next = parentOf.get(current)
    if (next === undefined || seen.has(current)) return null
    seen.add(current)
    current = next
    hops++
  }
  return hops
}

export const mapTree = (
  nodes: readonly TreeNode[],
  edges: readonly TreeEdge[],
  unfolded: ReadonlySet<number> = new Set(),
): MapTree => {
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const roots = new Set(nodes.filter((n) => isRoot(n.role)).map((n) => n.id))
  const parentEdge = new Map(
    edges.filter((e) => e.parent && byId.has(e.a) && byId.has(e.b)).map((e) => [e.a, e]),
  )
  const parentOf = new Map([...parentEdge].map(([child, e]) => [child, e.b]))
  const depth = new Map(nodes.map((n) => [n.id, depthOf(n.id, parentOf, roots)]))
  const children = new Map<number, TreeNode[]>()
  for (const n of nodes) {
    const parent = parentOf.get(n.id)
    if (parent !== undefined && depth.get(n.id) !== null && !roots.has(n.id))
      children.set(parent, [...(children.get(parent) ?? []), n])
  }
  const isInfra = (n: TreeNode) =>
    roots.has(n.id) || INFRASTRUCTURE.includes(n.role) || (children.get(n.id)?.length ?? 0) > 0
  const byName = (a: TreeNode, b: TreeNode) => a.name.localeCompare(b.name) || a.id - b.id
  const worstFirst = (a: TreeNode, b: TreeNode) => RANK[a.status] - RANK[b.status] || byName(a, b)
  const kidsOf = (n: TreeNode) => (children.get(n.id) ?? []).filter(isInfra).sort(byName)
  const clientsOf = (n: TreeNode) =>
    (children.get(n.id) ?? []).filter((c) => !isInfra(c)).sort(worstFirst)
  const shownOf = (list: TreeNode[], owner: number) =>
    unfolded.has(owner) || list.length <= SHOWN + 1 ? list : list.slice(0, SHOWN)

  const tileOf = (n: TreeNode) => (roots.has(n.id) ? ROOT_TILE : ROUTER_TILE)
  const stackHeight = (n: TreeNode) => {
    const all = clientsOf(n)
    const shown = shownOf(all, n.id).length
    return shown ? 22 + shown * ROW + (shown < all.length ? 40 : 0) : 0
  }
  const ownWidth = (n: TreeNode) =>
    Math.max(tileOf(n) + 12 + LABEL_W, clientsOf(n).length ? 24 + CLIENT_W : 0)
  const widths = new Map<number, number>()
  const width = (n: TreeNode): number => {
    const known = widths.get(n.id)
    if (known !== undefined) return known
    const kids = kidsOf(n)
    const w = Math.max(
      ownWidth(n),
      kids.reduce((sum, k) => sum + width(k), 0) + Math.max(0, kids.length - 1) * COL_GAP,
    )
    widths.set(n.id, w)
    return w
  }

  // A level is as tall as its tallest list of end devices
  const levels: TreeNode[][] = []
  const rootNodes = nodes.filter((n) => roots.has(n.id)).sort(byName)
  const collect = (n: TreeNode, d: number) => {
    levels[d] = [...(levels[d] ?? []), n]
    for (const k of kidsOf(n)) collect(k, d + 1)
  }
  for (const r of rootNodes) collect(r, 0)
  const levelY = [0]
  levels.forEach((list, d) => {
    const tile = Math.max(...list.map(tileOf))
    levelY[d + 1] = (levelY[d] ?? 0) + tile + Math.max(0, ...list.map(stackHeight)) + LEVEL_GAP
  })

  const placed: Placed[] = []
  const at = new Map<number, Placed>()
  const put = (p: Placed) => {
    placed.push(p)
    at.set(p.id, p)
  }
  const folded: Folded[] = []
  // A device sits over the middle of its routers, its own block kept inside its column
  const place = (n: TreeNode, left: number, d: number) => {
    const w = width(n)
    const tile = tileOf(n)
    const kids = kidsOf(n)
    const kidsW =
      kids.reduce((sum, k) => sum + width(k), 0) + Math.max(0, kids.length - 1) * COL_GAP
    const middle = kids.length ? left + w / 2 : left + ownWidth(n) / 2
    const x = Math.min(Math.max(middle - ownWidth(n) / 2, left), left + w - ownWidth(n))
    const y = levelY[d] ?? 0
    put({ id: n.id, x, y, tile, kind: roots.has(n.id) ? 'root' : 'router', depth: d, order: 0 })
    const all = clientsOf(n)
    const shown = shownOf(all, n.id)
    shown.forEach((c, i) => {
      put({
        id: c.id,
        x: x + tile / 2 + 22,
        y: y + tile + 22 + i * ROW,
        tile: CLIENT_TILE,
        kind: 'client',
        depth: d + 1,
        order: i,
      })
    })
    if (shown.length < all.length) {
      folded.push({
        parent: n.id,
        x: x + tile / 2 + 22,
        y: y + tile + 22 + shown.length * ROW + 2,
        hidden: all.slice(shown.length).map((c) => c.id),
      })
    }
    let kidLeft = left + (w - kidsW) / 2
    for (const k of kids) {
      place(k, kidLeft, d + 1)
      kidLeft += width(k) + COL_GAP
    }
  }
  let forest = 0
  for (const r of rootNodes) {
    place(r, forest, 0)
    forest += width(r) + 2 * COL_GAP
  }
  forest = Math.max(0, forest - 2 * COL_GAP)

  // Devices without a way to a root: a list beside the tree
  const loose = nodes.filter((n) => !roots.has(n.id) && depth.get(n.id) === null).sort(worstFirst)
  const deepest = levels.length
  const looseAt = loose.length ? { x: forest + (forest ? 2 * COL_GAP : 0), y: 0 } : null
  loose.forEach((n, i) => {
    put({
      id: n.id,
      x: (looseAt?.x ?? 0) + 4,
      y: LOOSE_HEAD + i * ROW,
      tile: CLIENT_TILE,
      kind: 'client',
      depth: deepest,
      order: i,
    })
  })

  // Everything moves by the padding, so nothing touches the edge
  for (const p of placed) {
    p.x = Math.round(p.x + PADDING)
    p.y = Math.round(p.y + PADDING)
  }
  const shifted = folded.map((f) => ({
    ...f,
    x: Math.round(f.x + PADDING),
    y: Math.round(f.y + PADDING),
  }))

  const lines: TreeLine[] = []
  for (const p of placed) {
    if (p.kind === 'root' || depth.get(p.id) === null) continue
    const parentId = parentOf.get(p.id)
    const parent = parentId === undefined ? undefined : at.get(parentId)
    if (!parent) continue
    const cx = parent.x + parent.tile / 2
    const bottom = parent.y + parent.tile
    const hasList = clientsOf(byId.get(parent.id) as TreeNode).length > 0
    const mid = p.y + p.tile / 2
    const d =
      p.kind === 'router'
        ? elbow(hasList ? cx - 14 : cx, bottom, p.x + p.tile / 2, p.y, p.y - 34)
        : `M${cx + 4},${bottom} V${mid - 8} Q${cx + 4},${mid} ${cx + 12},${mid} H${p.x}`
    lines.push({
      id: p.id,
      d,
      quality: parentEdge.get(p.id)?.quality ?? null,
      depth: p.depth,
      order: p.order,
    })
  }

  const right = Math.max(
    0,
    ...placed.map((p) => p.x + (p.kind === 'client' ? CLIENT_W : p.tile + 12 + LABEL_W)),
  )
  const bottom = Math.max(0, ...placed.map((p) => p.y + p.tile), ...shifted.map((f) => f.y + 30))
  return {
    width: right + PADDING,
    height: bottom + PADDING,
    placed,
    lines,
    folded: shifted,
    loose: looseAt ? { x: looseAt.x + PADDING, y: looseAt.y + PADDING } : null,
  }
}
