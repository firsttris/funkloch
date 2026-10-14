// Does a router do its job? A short finding from one topology snapshot: how many devices go
// through it, how good its way towards the root is, and whether other routers already cover the
// devices around it. Rules only, from the neighbor tables (no routing tables).
import {
  carriedCounts,
  isRoot,
  type LinkPair,
  type LinkValue,
  linkPairs,
  type MapLink,
  parentsOf,
  wayToRoot,
} from './topology'
import type { Role } from './types'

export type FindingNode = { id: number; name: string; role: Role }

export type FindingInput = {
  id: number
  nodes: readonly FindingNode[]
  /** One snapshot's links, each direction on its own, parents (and uplinks) marked */
  links: readonly MapLink[]
  linkScore: (link: LinkValue) => number | null
  /** Score below which a link counts as weak */
  weak: number
}

export type Advice =
  /** Nothing uses it and its way is weak: it would help more between this area and the root */
  | 'move_towards_root'
  /** Devices use it, but its way is weak: a router between it and the root would help them */
  | 'strengthen_uplink'
  /** Nothing uses it, its neighbors are covered: it stands by in case one of them fails */
  | 'reserve'

export type RouterFinding = {
  /** Devices whose parent it is */
  children: number
  /** Devices whose way to the root leads through it, its children included */
  carried: number
  /** The next device towards the root and the link to it */
  uplink: (LinkPair & { id: number; name: string; root: boolean; weak: boolean }) | null
  /** The root its way leads to, else the first root of the snapshot */
  root: { name: string; role: Role } | null
  /** Neighbors that were judged: linked, neither root nor uplink, with a link value */
  neighbors: number
  /**
   * Routers that hear each of its neighbors at least as well as it does; empty unless every
   * neighbor is covered
   */
  coveredBy: { id: number; name: string; neighbor: boolean }[]
  advice: Advice | null
}

const adviceOf = (carried: number, weakUplink: boolean, covered: boolean): Advice | null => {
  if (carried === 0 && weakUplink) return 'move_towards_root'
  if (carried > 0 && weakUplink) return 'strengthen_uplink'
  if (carried === 0 && covered) return 'reserve'
  return null
}

export const routerFinding = (input: FindingInput): RouterFinding => {
  const { id, nodes, links } = input
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const pair = linkPairs(links, input.linkScore)
  const parents = parentsOf(links)
  const up = parents.get(id)
  const upNode = up === undefined ? undefined : byId.get(up)
  const upPair = up === undefined ? null : pair(id, up)
  const uplink =
    upNode && upPair
      ? {
          ...upPair,
          id: upNode.id,
          name: upNode.name,
          root: isRoot(upNode.role),
          weak: upPair.score !== null && upPair.score < input.weak,
        }
      : null

  const end = byId.get(
    wayToRoot(
      id,
      links.map((l) => ({ a: l.from, b: l.to, parent: l.parent })),
    ).at(-1) ?? id,
  )
  const rootNode = end && isRoot(end.role) ? end : nodes.find((n) => isRoot(n.role))

  const linked = new Set(
    links.flatMap((l) => (l.from === id ? [l.to] : l.to === id ? [l.from] : [])),
  )
  const judged = [...linked].flatMap((other) => {
    const node = byId.get(other)
    const score = pair(id, other)?.score ?? null
    return node && !isRoot(node.role) && other !== up && score !== null ? [{ node, score }] : []
  })
  // Other routers only: the root is where the way leads, not a stand-in for this router
  const routers = nodes.filter((n) => n.id !== id && n.role === 'router')
  const coverersOf = (neighbor: FindingNode, own: number) =>
    routers.filter((r) => r.id !== neighbor.id && (pair(r.id, neighbor.id)?.score ?? -1) >= own)
  const covering = judged.map(({ node, score }) => coverersOf(node, score))
  const covered = judged.length > 0 && covering.every((c) => c.length > 0)
  const coveredBy = covered
    ? [...new Map(covering.flat().map((r) => [r.id, r])).values()]
        .map((r) => ({ id: r.id, name: r.name, neighbor: linked.has(r.id) }))
        .sort((a, b) => a.name.localeCompare(b.name))
    : []

  const carried = carriedCounts(parents).get(id) ?? 0
  return {
    children: [...parents.values()].filter((p) => p === id).length,
    carried,
    uplink,
    root: rootNode ? { name: rootNode.name, role: rootNode.role } : null,
    neighbors: judged.length,
    coveredBy,
    advice: adviceOf(carried, uplink?.weak ?? false, covered),
  }
}
