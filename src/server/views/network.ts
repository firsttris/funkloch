import '@tanstack/react-start/server-only'
import { PROTOCOLS } from '~/adapters/registry'
import { placeEdgeLabels } from '~/core/edge-labels'
import { layout } from '~/core/map-layout'
import { hopsToRoot, isRoot, type MapNode, mapEdges } from '~/core/topology'
import { DAY, type Role, type Status } from '~/core/types'
import { devicesOfProtocol, displayName, linksOfSnapshot, snapshotsOf } from '~/db/queries'
import type { ViewContext } from './context'
import { adapterStates, deviceRows, protocolInfo } from './shared'

export const SNAPSHOT_DAYS = 7

/**
 * The map of one protocol at one snapshot (the newest without `snapshotId`): nodes with status
 * and position, one edge per pair, and the facts of the selected device.
 */
export const networkView = (
  { db, now, settings, adapters }: ViewContext,
  requested: string | null,
  snapshotId: number | null,
  selectedId: number | null,
) => {
  // Without a choice, the first protocol that is on
  const protocol = requested ?? adapters[0]?.meta.id ?? 'zigbee'
  const meta = PROTOCOLS[protocol]
  const snapshots = snapshotsOf(db, protocol, now - SNAPSHOT_DAYS * DAY)
  const snapshot = snapshots.find((s) => s.id === snapshotId) ?? snapshots.at(-1) ?? null
  const rows = new Map(deviceRows(db, now, 24, settings.thresholds).rows.map((r) => [r.id, r]))
  const devices = devicesOfProtocol(db, protocol)
  const status = (id: number, role: Role): Status =>
    isRoot(role) ? 'unknown' : (rows.get(id)?.status ?? 'unknown')

  const nodes: MapNode[] = devices.map((d) => ({
    id: d.id,
    name: displayName(d),
    role: d.role as Role,
    status: status(d.id, d.role as Role),
  }))
  const offline = new Set(nodes.filter((n) => n.status === 'offline').map((n) => n.id))
  const links = snapshot
    ? linksOfSnapshot(db, snapshot.id).map((l) => ({
        from: l.fromId,
        to: l.toId,
        lqi: l.lqi,
        rssi: l.rssi,
        parent: l.parent,
      }))
    : []
  const edges = mapEdges(links, meta?.linkScore ?? (() => null), offline)
  const map = layout(nodes, edges)
  const positions = new Map(map.positions.map((p) => [p.id, p]))
  const labelOf = (edge: (typeof edges)[number]) => meta?.formatLink(edge) ?? ''
  // Only parent lines carry their value on the map
  const labelSpots = placeEdgeLabels(
    nodes,
    map.positions,
    edges.filter((e) => e.parent).map((e) => ({ a: e.a, b: e.b, text: labelOf(e) })),
  )
  const roots = new Set(nodes.filter((n) => isRoot(n.role)).map((n) => n.id))
  const byId = new Map(nodes.map((n) => [n.id, n]))

  const selected = selectedId === null ? null : (byId.get(selectedId) ?? null)
  const parentEdge = selected ? edges.find((e) => e.parent && e.a === selected.id) : undefined
  const states = adapterStates(adapters)

  return {
    now,
    protocol,
    protocols: protocolInfo([...new Set([...states.map((a) => a.id)])]),
    adapters: states,
    snapshots: snapshots.map((s) => ({ id: s.id, ts: s.ts })),
    snapshot: snapshot ? { id: snapshot.id, ts: snapshot.ts } : null,
    canRequest: adapters.some((a) => a.meta.id === protocol && a.requestTopology !== undefined),
    networkmapHours: settings.networkmapHours,
    /** Size of the drawing in pixels; it grows with the network */
    size: { width: map.width, height: map.height },
    nodes: nodes.map((n) => ({
      ...n,
      x: positions.get(n.id)?.x ?? 0,
      y: positions.get(n.id)?.y ?? 0,
      root: roots.has(n.id),
    })),
    edges: edges.map((e) => ({
      ...e,
      label: labelOf(e),
      labelAt: labelSpots.get(`${e.a}-${e.b}`) ?? null,
    })),
    selected: selected
      ? {
          ...selected,
          root: roots.has(selected.id),
          parent: parentEdge ? (byId.get(parentEdge.b)?.name ?? null) : null,
          parentLink: parentEdge ? (meta?.formatLink(parentEdge) ?? null) : null,
          hops: hopsToRoot(selected.id, edges, roots),
          neighbors: edges.filter((e) => e.a === selected.id || e.b === selected.id).length,
        }
      : null,
  }
}

export type NetworkView = ReturnType<typeof networkView>
