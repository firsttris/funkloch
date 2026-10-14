// Where the network is narrow: a weak link on the uplink tree that many devices go through. Each
// parent link carries the device below it and everything that hangs on that device; one that
// carries many and is weak in either direction is where a router in between would help most.
import {
  carriedCounts,
  isRoot,
  type LinkPair,
  type LinkValue,
  linkPairs,
  type MapLink,
  parentsOf,
} from './topology'
import type { Role } from './types'

/** Fewer devices behind a weak link are a weak device, not a bottleneck */
export const BOTTLENECK_MIN_DEVICES = 3

export type Bottleneck = {
  /** The device below the link */
  child: number
  /** Its parent, one step closer to the root */
  parent: number
  /** The child and every device whose way leads through it */
  devices: number
  link: LinkPair
}

export const bottlenecks = (input: {
  nodes: readonly { id: number; role: Role }[]
  /** One snapshot's links, each direction on its own, parents (and uplinks) marked */
  links: readonly MapLink[]
  linkScore: (link: LinkValue) => number | null
  /** Score below which a link counts as weak */
  weak: number
  minDevices?: number
}): Bottleneck[] => {
  const roles = new Map(input.nodes.map((n) => [n.id, n.role]))
  const parents = parentsOf(input.links)
  const carried = carriedCounts(parents)
  const pair = linkPairs(input.links, input.linkScore)
  const minDevices = input.minDevices ?? BOTTLENECK_MIN_DEVICES
  return [...parents]
    .flatMap(([child, parent]) => {
      const role = roles.get(child)
      if (role === undefined || isRoot(role) || !roles.has(parent)) return []
      const devices = (carried.get(child) ?? 0) + 1
      const link = pair(child, parent)
      if (devices < minDevices || !link || link.score === null || link.score >= input.weak)
        return []
      return [{ child, parent, devices, link }]
    })
    .sort((a, b) => b.devices - a.devices || (a.link.score ?? 0) - (b.link.score ?? 0))
}
