// OTBR answers to observations. Pure: the adapter passes in what it fetched and the time.
import type { DeviceInfo, Link, Measurement, Role } from '~/core/types'
import { withUplinks } from '~/core/uplinks'
import { threadMeta, threadScore } from './meta'
import type {
  DeviceItem,
  EnergyScan,
  LegacyDiagnostics,
  LinkEntry,
  NetworkDiagnostic,
} from './schemas'

const PROTOCOL = threadMeta.id

/**
 * Link quality 0–3 from the link margin in dB, as OpenThread does it
 * (openthread src/core/thread/link_quality.cpp: thresholds 20, 10 and 2 dB).
 */
export const linkQualityFromMargin = (margin: number) =>
  margin > 20 ? 3 : margin > 10 ? 2 : margin > 2 ? 1 : 0

/**
 * A full Thread device that is still a child is router-eligible (REED): Thread makes it a router
 * only when the mesh needs one, which shows as a role change.
 */
const roleOf = (item: DeviceItem): Role => {
  if (item.type === 'threadBorderRouter') return 'border_router'
  const mode = item.attributes.mode
  if (mode?.rxOnWhenIdle === false) return 'sleepy_end_device'
  const role = item.attributes.role
  if (role === 'router' || role === 'leader') return 'router'
  if (role === 'child') return mode?.fullThreadDevice ? 'router_eligible' : 'end_device'
  return mode?.fullThreadDevice ? 'router' : 'unknown'
}

/** The SRP host name without ".local", else the extended address */
const nameOf = (item: DeviceItem, address: string) =>
  item.attributes.hostname?.replace(/\.local\.?$/, '') || address

export const toDeviceInfo = (item: DeviceItem): DeviceInfo => {
  const address = (item.attributes.extAddress ?? item.id).toLowerCase()
  const role = roleOf(item)
  return {
    protocol: PROTOCOL,
    address,
    name: nameOf(item, address),
    role,
    model: item.attributes.vendorModel ?? null,
    vendor: item.attributes.vendorName ?? null,
    power: role === 'sleepy_end_device' ? 'battery' : role === 'unknown' ? 'unknown' : 'mains',
    networkAddress: item.attributes.rloc16 ?? null,
  }
}

type Heard = { from: string; to: string; rssi: number | null; lqi: number | null; child: boolean }

/** One entry of a router's table: how `router` hears `entry` */
const heard = (router: string, entry: LinkEntry, child: boolean): Heard => ({
  from: entry.extAddress.toLowerCase(),
  to: router,
  rssi: entry.averageRssi ?? entry.lastRssi ?? null,
  lqi: entry.linkMargin === undefined ? null : linkQualityFromMargin(entry.linkMargin),
  child,
})

const scoreOf = (h: Heard) =>
  h.rssi === null || h.lqi === null ? null : threadScore(h.rssi, h.lqi)

/**
 * Measurements and links from the routers' diagnostics. A child is measured by how its parent
 * hears it, a router by the best of the routers that hear it. Children hang on their parent;
 * routers have none, so each gets an uplink towards the border router (core/uplinks).
 */
export const fromDiagnostics = (
  diagnostics: readonly NetworkDiagnostic[],
  ts: number,
  /** Border routers: the root of the map, neither measured nor hung on a parent */
  roots: ReadonlySet<string> = new Set(),
) => {
  const entries: Heard[] = diagnostics.flatMap((d) => {
    const router = d.attributes.extAddress.toLowerCase()
    return [
      ...(d.attributes.children ?? []).map((c) => heard(router, c, true)),
      ...(d.attributes.routerNeighbors ?? []).map((n) => heard(router, n, false)),
    ]
  })

  const best = new Map<string, Heard>()
  for (const entry of entries) {
    if (roots.has(entry.from)) continue
    const current = best.get(entry.from)
    const preferred =
      !current ||
      (entry.child && !current.child) ||
      (entry.child === current.child && (scoreOf(entry) ?? -1) > (scoreOf(current) ?? -1))
    if (preferred) best.set(entry.from, entry)
  }

  const measurements: Measurement[] = [...best.values()].flatMap((h) => {
    const score = scoreOf(h)
    if (score === null || h.rssi === null) return []
    return [
      {
        protocol: PROTOCOL,
        address: h.from,
        ts,
        score,
        raw: h.rssi,
        lqi: h.lqi,
        rssi: h.rssi,
        battery: null,
        source: 'diagnostic',
      },
    ]
  })

  const links: Link[] = entries.map((h) => ({
    from: h.from,
    to: h.to,
    lqi: h.lqi,
    rssi: h.rssi,
    parent: h.child && best.get(h.from) === h,
  }))

  return { measurements, links: withUplinks(links, roots, threadMeta.linkScore) }
}

/** Energy per channel: the strongest of the samples, in dBm */
export const fromEnergyScan = (scan: EnergyScan) =>
  scan.attributes.report.flatMap((r) =>
    r.maxRssi.length === 0 ? [] : [{ channel: r.channel, energy: Math.max(...r.maxRssi) }],
  )

/**
 * Older images (GET /diagnostics): devices and router links with link quality 0–3, but no RSSI,
 * so no measurements. Router ids come from the RLOC16 (router id = RLOC16 >> 10).
 */
export const fromLegacyDiagnostics = (nodes: LegacyDiagnostics) => {
  const byRouterId = new Map(
    nodes
      .filter((n) => n.Rloc16 !== undefined && (n.Rloc16 & 0x1ff) === 0)
      .map((n) => [(n.Rloc16 as number) >> 10, n]),
  )
  const devices: DeviceInfo[] = nodes.map((n) => {
    const router = n.Rloc16 !== undefined && (n.Rloc16 & 0x1ff) === 0
    const sleepy = n.Mode?.RxOnWhenIdle === 0
    // Mode DeviceType 1: a full Thread device, router-eligible while it is a child
    const role: Role = router
      ? 'router'
      : sleepy
        ? 'sleepy_end_device'
        : n.Mode?.DeviceType === 1
          ? 'router_eligible'
          : 'end_device'
    return {
      protocol: PROTOCOL,
      address: n.ExtAddress.toLowerCase(),
      name: n.ExtAddress.toLowerCase(),
      role,
      model: null,
      vendor: null,
      power: sleepy ? 'battery' : 'unknown',
      networkAddress: n.Rloc16 === undefined ? null : `0x${n.Rloc16.toString(16).padStart(4, '0')}`,
    }
  })
  const links: Link[] = nodes.flatMap((n) => {
    const self = n.ExtAddress.toLowerCase()
    const routes = (n.Route?.RouteData ?? []).flatMap((r) => {
      const other = byRouterId.get(r.RouteId)
      const quality = Math.min(r.LinkQualityIn, r.LinkQualityOut)
      if (!other || other.ExtAddress.toLowerCase() === self || quality === 0) return []
      return [
        { from: self, to: other.ExtAddress.toLowerCase(), lqi: quality, rssi: null, parent: false },
      ]
    })
    const parent =
      n.Rloc16 !== undefined && (n.Rloc16 & 0x1ff) !== 0
        ? byRouterId.get(n.Rloc16 >> 10)
        : undefined
    return parent
      ? [
          ...routes,
          { from: self, to: parent.ExtAddress.toLowerCase(), lqi: null, rssi: null, parent: true },
        ]
      : routes
  })
  return { devices, links }
}
