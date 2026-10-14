import '@tanstack/react-start/server-only'
import { PROTOCOLS } from '~/adapters/registry'
import { bottlenecks } from '~/core/bottlenecks'
import type { Role } from '~/core/types'
import type { Db } from '~/db/client'
import { devicesOfProtocol, displayName, latestSnapshot, linksOfSnapshot } from '~/db/queries'

/** The bottlenecks of one snapshot with names and the link written the protocol's way */
export const bottlenecksOf = (db: Db, protocol: string, snapshotId: number, weak: number) => {
  const meta = PROTOCOLS[protocol]
  if (!meta) return []
  const devices = devicesOfProtocol(db, protocol)
  const names = new Map(devices.map((d) => [d.id, displayName(d)]))
  const found = bottlenecks({
    nodes: devices.map((d) => ({ id: d.id, role: d.role as Role })),
    links: linksOfSnapshot(db, snapshotId).map((l) => ({
      from: l.fromId,
      to: l.toId,
      lqi: l.lqi,
      rssi: l.rssi,
      parent: l.parent,
    })),
    linkScore: meta.linkScore,
    weak,
  })
  return found.map((b) => ({
    protocol,
    child: { id: b.child, name: names.get(b.child) ?? String(b.child) },
    parent: { id: b.parent, name: names.get(b.parent) ?? String(b.parent) },
    devices: b.devices,
    // How the device below hears its parent first, then how it is heard
    link: meta.formatLinkPair(b.link.back, b.link.there),
  }))
}

/** The bottlenecks in the newest snapshot of each protocol */
export const latestBottlenecks = (db: Db, protocols: readonly string[], weak: number) =>
  protocols.flatMap((protocol) => {
    const snapshot = latestSnapshot(db, protocol)
    return snapshot ? bottlenecksOf(db, protocol, snapshot.id, weak) : []
  })

export type BottleneckView = ReturnType<typeof bottlenecksOf>[number]
