// The network map as data: nodes, deduplicated edges and the way to the root. The drawing is laid
// out in map-tree.ts.
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

/** Coordinators and border routers: the root of the map, with no signal of their own */
export const ROOT_ROLES: Role[] = ['coordinator', 'border_router']
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
export const hopsToRoot = (
  id: number,
  edges: readonly { a: number; b: number; parent: boolean }[],
  roots: ReadonlySet<number>,
) => {
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

/** The device and its parents up to the root, in that order; a loop ends the way */
export const wayToRoot = (
  id: number,
  edges: readonly { a: number; b: number; parent: boolean }[],
) => {
  const parentOf = new Map(edges.filter((e) => e.parent).map((e) => [e.a, e.b]))
  const way = [id]
  for (let up = parentOf.get(id); up !== undefined && !way.includes(up); up = parentOf.get(up))
    way.push(up)
  return way
}
