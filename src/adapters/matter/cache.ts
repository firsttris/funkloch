// The adapter's copy of the server's nodes, with when each polled attribute was last read or
// reported, so a table a sleeping device reported days ago does not pass for a new reading.
import { type MatterNode, signalPaths } from './nodes'

export const createNodeCache = () => {
  const nodes = new Map<string, MatterNode>()
  const readAt = new Map<string, Map<string, number>>()

  const markRead = (id: string, paths: readonly string[], ts: number) => {
    const times = readAt.get(id) ?? new Map<string, number>()
    for (const path of paths) times.set(path, ts)
    readAt.set(id, times)
  }

  /** The node without the polled values read before `since` */
  const fresh = (node: MatterNode, since: number): MatterNode => {
    const times = readAt.get(node.id)
    const stale = signalPaths(node).filter((path) => (times?.get(path) ?? -Infinity) < since)
    if (stale.length === 0) return node
    const attributes = { ...node.attributes }
    for (const path of stale) delete attributes[path]
    return { ...node, attributes }
  }

  return {
    all: () => [...nodes.values()],
    get: (id: string) => nodes.get(id),
    /** All nodes anew, after (re)connecting; what was read before still counts as read then */
    reset: (list: readonly MatterNode[]) => {
      nodes.clear()
      for (const node of list) nodes.set(node.id, node)
    },
    put: (node: MatterNode) => nodes.set(node.id, node),
    remove: (id: string) => {
      nodes.delete(id)
      readAt.delete(id)
    },
    /** Merges attribute values in; returns the node, or undefined for one not known */
    update: (id: string, values: Record<string, unknown>, ts: number) => {
      const node = nodes.get(id)
      if (!node) return undefined
      const updated = { ...node, attributes: { ...node.attributes, ...values } }
      nodes.set(id, updated)
      markRead(id, Object.keys(values), ts)
      return updated
    },
    /** Every node with only the polled values read since `since` */
    freshSince: (since: number) => [...nodes.values()].map((node) => fresh(node, since)),
  }
}

export type NodeCache = ReturnType<typeof createNodeCache>
