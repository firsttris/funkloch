import '@tanstack/react-start/server-only'
import { PROTOCOLS } from '~/adapters/registry'
import { deviceKind } from '~/core/device-kind'
import { signalBars } from '~/core/map-tree'
import { hopsToRoot, isRoot, type MapNode, mapEdges, wayToRoot } from '~/core/topology'
import { DAY, type Role, type Status } from '~/core/types'
import { devicesOfProtocol, displayName, linksOfSnapshot, snapshotsOf } from '~/db/queries'
import type { ViewContext } from './context'
import { adapterStates, deviceRows, protocolInfo } from './shared'

export const SNAPSHOT_DAYS = 7

/**
 * The map of one protocol at one snapshot (the newest without `snapshotId`): nodes with status
 * and kind, one edge per pair with its value and signal bars, and the facts of the selected device
 * with its way to the root. The browser lays the tree out (core/map-tree.ts), since it unfolds
 * lists.
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

  const kinds = new Map(
    devices.map((d) => [d.id, deviceKind(displayName(d), d.role as Role, d.model)]),
  )
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
  const labelOf = (edge: (typeof edges)[number]) => meta?.formatLink(edge) ?? ''
  const barsOf = (edge: (typeof edges)[number]) =>
    edge.quality === 'offline' ? 0 : signalBars(meta?.linkScore(edge) ?? null)
  const roots = new Set(nodes.filter((n) => isRoot(n.role)).map((n) => n.id))
  const byId = new Map(nodes.map((n) => [n.id, n]))

  const selected = selectedId === null ? null : (byId.get(selectedId) ?? null)
  const parentEdge = selected ? edges.find((e) => e.parent && e.a === selected.id) : undefined
  const uplink = new Map(edges.filter((e) => e.parent).map((e) => [e.a, e]))
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
    nodes: nodes.map((n) => ({ ...n, root: roots.has(n.id), kind: kinds.get(n.id) ?? 'device' })),
    edges: edges.map((e) => ({
      a: e.a,
      b: e.b,
      parent: e.parent,
      quality: e.quality,
      label: labelOf(e),
      bars: barsOf(e),
    })),
    selected: selected
      ? {
          ...selected,
          root: roots.has(selected.id),
          parent: parentEdge ? (byId.get(parentEdge.b)?.name ?? null) : null,
          parentLink: parentEdge ? (meta?.formatLink(parentEdge) ?? null) : null,
          hops: hopsToRoot(selected.id, edges, roots),
          neighbors: edges.filter((e) => e.a === selected.id || e.b === selected.id).length,
          /** The device, then each parent up to the root, with the link to the next one */
          way: wayToRoot(selected.id, edges).flatMap((id) => {
            const n = byId.get(id)
            const up = uplink.get(id)
            return n
              ? [
                  {
                    id,
                    name: n.name,
                    root: roots.has(id),
                    kind: kinds.get(id) ?? 'device',
                    quality: up?.quality ?? null,
                    label: up ? labelOf(up) : null,
                    bars: up ? barsOf(up) : 0,
                  },
                ]
              : []
          }),
        }
      : null,
  }
}

export type NetworkView = ReturnType<typeof networkView>
