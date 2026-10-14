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
/** The side padding of wrapped rows on a narrow map, where every pixel of a phone counts */
const NARROW_PADDING = 12
const NARROW = 480
const LOOSE_HEAD = 30
/** Room left of wrapped rows for the line that joins them to the root */
const SPINE = 34
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
const INFRASTRUCTURE: Role[] = ['coordinator', 'border_router', 'access_point', 'router']

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

/** A line through `points` with round corners, for the way to a wrapped row */
const rounded = (points: readonly [number, number][]) => {
  const [first, ...rest] = points
  if (!first) return ''
  let d = `M${first[0]},${first[1]}`
  rest.forEach(([x, y], i) => {
    const next = rest[i + 1]
    if (!next) {
      d += ` L${x},${y}`
      return
    }
    const [px, py] = points[i] as [number, number]
    const r = Math.min(
      10,
      Math.abs(x - px + (y - py)) / 2,
      Math.abs(next[0] - x + (next[1] - y)) / 2,
    )
    const inX = Math.sign(x - px)
    const inY = Math.sign(y - py)
    const outX = Math.sign(next[0] - x)
    const outY = Math.sign(next[1] - y)
    d += ` L${x - inX * r},${y - inY * r} Q${x},${y} ${x + outX * r},${y + outY * r}`
  })
  return d
}

/** The routers under the root in rows that each fit `room`; at least one router per row */
const wrapInRows = <T>(items: readonly T[], widthOf: (item: T) => number, room: number) => {
  const rows: T[][] = []
  let used = 0
  for (const item of items) {
    const w = widthOf(item)
    const row = rows.at(-1)
    if (row && used + COL_GAP + w <= room) {
      row.push(item)
      used += COL_GAP + w
    } else {
      rows.push([item])
      used = w
    }
  }
  return rows
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
  /**
   * The width the map has. When the routers under a single root do not fit side by side, they
   * wrap into rows, so the map shows at full size instead of shrinking to fit.
   */
  maxWidth = Number.POSITIVE_INFINITY,
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
  const levelYs = (tops: readonly TreeNode[], top: number) => {
    const levels: TreeNode[][] = []
    const collect = (n: TreeNode, d: number) => {
      levels[d] = [...(levels[d] ?? []), n]
      for (const k of kidsOf(n)) collect(k, d + 1)
    }
    for (const n of tops) collect(n, 0)
    const ys = [top]
    levels.forEach((list, d) => {
      const tile = Math.max(...list.map(tileOf))
      ys[d + 1] = (ys[d] ?? 0) + tile + Math.max(0, ...list.map(stackHeight)) + LEVEL_GAP
    })
    return ys
  }
  const rootNodes = nodes.filter((n) => roots.has(n.id)).sort(byName)

  const placed: Placed[] = []
  const at = new Map<number, Placed>()
  const put = (p: Placed) => {
    placed.push(p)
    at.set(p.id, p)
  }
  const folded: Folded[] = []
  /** A device's tile and the list of its end devices below it */
  const putWithClients = (n: TreeNode, x: number, y: number, d: number) => {
    const tile = tileOf(n)
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
  }
  /** Where a device sits over the middle of its routers, its own block kept inside its column */
  const xIn = (n: TreeNode, left: number, w: number, kidsW: number) => {
    const middle = kidsOf(n).length && kidsW > 0 ? left + w / 2 : left + ownWidth(n) / 2
    return Math.min(Math.max(middle - ownWidth(n) / 2, left), left + w - ownWidth(n))
  }
  const rowWidth = (row: readonly TreeNode[]) =>
    row.reduce((sum, k) => sum + width(k), 0) + Math.max(0, row.length - 1) * COL_GAP
  const place = (n: TreeNode, left: number, d: number, ys: readonly number[]) => {
    const w = width(n)
    const kids = kidsOf(n)
    const kidsW = rowWidth(kids)
    putWithClients(n, xIn(n, left, w, kidsW), ys[d] ?? 0, d)
    let kidLeft = left + (w - kidsW) / 2
    for (const k of kids) {
      place(k, kidLeft, d + 1, ys)
      kidLeft += width(k) + COL_GAP
    }
  }

  // One root whose routers do not fit side by side: its routers wrap into rows
  const [onlyRoot] = rootNodes
  const padX = maxWidth < NARROW ? NARROW_PADDING : PADDING
  const room = maxWidth - 2 * padX - SPINE
  const rows =
    rootNodes.length === 1 && onlyRoot && width(onlyRoot) > maxWidth - 2 * PADDING
      ? wrapInRows(kidsOf(onlyRoot), width, room)
      : null
  /** The row of each router under the wrapped root, from the second row on */
  const rowOf = new Map<number, number>()
  /** The top of each row */
  const rowTops: number[] = []
  let forest = 0
  if (onlyRoot && rows && rows.length > 1) {
    const firstW = rowWidth(rows[0] ?? [])
    putWithClients(onlyRoot, SPINE + xIn(onlyRoot, 0, firstW, firstW), 0, 0)
    let top = tileOf(onlyRoot) + stackHeight(onlyRoot) + LEVEL_GAP
    rows.forEach((row, r) => {
      const ys = levelYs(row, top)
      rowTops.push(top)
      let kidLeft = SPINE
      for (const k of row) {
        rowOf.set(k.id, r)
        place(k, kidLeft, 1, [0, ...ys])
        kidLeft += width(k) + COL_GAP
      }
      top = ys.at(-1) ?? top
    })
    forest = SPINE + Math.max(...rows.map(rowWidth), ownWidth(onlyRoot))
  } else {
    const ys = levelYs(rootNodes, 0)
    for (const r of rootNodes) {
      place(r, forest, 0, ys)
      forest += width(r) + 2 * COL_GAP
    }
    forest = Math.max(0, forest - 2 * COL_GAP)
  }
  const sideX = rowTops.length > 0 ? padX : PADDING
  const deepest = Math.max(-1, ...placed.filter((p) => p.kind !== 'client').map((p) => p.depth)) + 1

  // Devices without a way to a root: a list beside the tree
  const loose = nodes.filter((n) => !roots.has(n.id) && depth.get(n.id) === null).sort(worstFirst)
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
    p.x = Math.round(p.x + sideX)
    p.y = Math.round(p.y + PADDING)
  }
  const shifted = folded.map((f) => ({
    ...f,
    x: Math.round(f.x + sideX),
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
    const from = hasList ? cx - 14 : cx
    const row = rowOf.get(p.id) ?? 0
    // A router of a later row: down from the root, along the first row's rail to the left edge,
    // down to its own row's rail and across to it
    const firstRail = (rowTops[0] ?? 0) + PADDING - 34
    const d =
      p.kind !== 'router'
        ? `M${cx + 4},${bottom} V${mid - 8} Q${cx + 4},${mid} ${cx + 12},${mid} H${p.x}`
        : row > 0
          ? rounded([
              [from, bottom],
              [from, firstRail],
              [sideX + SPINE / 2, firstRail],
              [sideX + SPINE / 2, p.y - 34],
              [p.x + p.tile / 2, p.y - 34],
              [p.x + p.tile / 2, p.y],
            ])
          : elbow(from, bottom, p.x + p.tile / 2, p.y, p.y - 34)
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
    width: right + sideX,
    height: bottom + PADDING,
    placed,
    lines,
    folded: shifted,
    loose: looseAt ? { x: looseAt.x + sideX, y: looseAt.y + PADDING } : null,
  }
}
