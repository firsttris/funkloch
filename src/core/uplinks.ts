// Routers have no parent: Zigbee neighbor tables list them as siblings, Thread routers talk to
// each other as equals. To show the way a router takes to the coordinator or border router, each
// router without a parent gets an uplink: of its neighbors one hop closer to the root, the one with
// the best link. Choosing only among closer neighbors keeps the result free of cycles.
import type { Link } from './types'

/** Strength of a link for choosing between neighbors, e.g. the protocol's link score */
export type LinkStrength = (link: Link) => number | null

const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`)

/** Hop distance of every reachable address from the roots, over links in either direction */
const distances = (links: readonly Link[], roots: ReadonlySet<string>) => {
  const neighbors = new Map<string, Set<string>>()
  for (const { from, to } of links) {
    if (from === to) continue
    neighbors.set(from, (neighbors.get(from) ?? new Set()).add(to))
    neighbors.set(to, (neighbors.get(to) ?? new Set()).add(from))
  }
  const distance = new Map<string, number>()
  let frontier = [...roots].filter((root) => neighbors.has(root))
  for (const root of frontier) distance.set(root, 0)
  for (let hop = 1; frontier.length > 0; hop++) {
    const next: string[] = []
    for (const node of frontier) {
      for (const neighbor of neighbors.get(node) ?? []) {
        if (distance.has(neighbor)) continue
        distance.set(neighbor, hop)
        next.push(neighbor)
      }
    }
    frontier = next
  }
  return { neighbors, distance }
}

/**
 * The links with an uplink marked as parent for every device that has none, is no root, and has a
 * path to a root. When only the uplink's own table holds the pair, a link in the child's direction
 * is added with its values.
 */
export const withUplinks = (
  links: readonly Link[],
  roots: ReadonlySet<string>,
  strength: LinkStrength,
): Link[] => {
  const hasParent = new Set(links.filter((l) => l.parent).map((l) => l.from))
  const { neighbors, distance } = distances(links, roots)
  // The better value of the two directions decides between neighbors
  const best = new Map<string, number>()
  for (const link of links) {
    const key = pairKey(link.from, link.to)
    best.set(key, Math.max(best.get(key) ?? -1, strength(link) ?? -1))
  }

  const uplinkOf = new Map<string, string>()
  for (const [node, around] of neighbors) {
    const own = distance.get(node)
    if (roots.has(node) || hasParent.has(node) || own === undefined) continue
    const closer = [...around].filter((n) => distance.get(n) === own - 1)
    const chosen = closer.sort(
      (a, b) =>
        (best.get(pairKey(node, b)) ?? -1) - (best.get(pairKey(node, a)) ?? -1) ||
        a.localeCompare(b),
    )[0]
    if (chosen) uplinkOf.set(node, chosen)
  }

  const marked = links.map((link) =>
    uplinkOf.get(link.from) === link.to ? { ...link, parent: true } : link,
  )
  const added = [...uplinkOf].flatMap(([node, uplink]) => {
    if (links.some((l) => l.from === node && l.to === uplink)) return []
    const reverse = links.find((l) => l.from === uplink && l.to === node)
    return reverse ? [{ ...reverse, from: node, to: uplink, parent: true }] : []
  })
  return [...marked, ...added]
}
