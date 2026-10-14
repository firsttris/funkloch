// OTBR answers to observations. Pure: the adapter passes in what it fetched and the time.
import type { DeviceInfo, Link, Measurement, Role, TxCounters } from '~/core/types'
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

/** What a device's network diagnostic says about its maker; null where the firmware set nothing */
export type VendorInfo = { vendor: string | null; model: string | null }

const NO_VENDOR: VendorInfo = { vendor: null, model: null }

/** "52bb…4b82": enough of the extended address to tell two devices of one model apart */
export const shortAddress = (address: string) => `${address.slice(0, 4)}…${address.slice(-4)}`

/**
 * The SRP host name without ".local"; without one the model (or maker) with the short address,
 * e.g. "ESP32-C6 Thread Router · 52bb…4b82"; else the extended address.
 */
export const threadName = (address: string, hostname: string | undefined, vendor: VendorInfo) => {
  const host = hostname?.replace(/\.local\.?$/, '')
  if (host) return host
  const maker = vendor.model ?? vendor.vendor
  return maker ? `${maker} · ${shortAddress(address)}` : address
}

/**
 * A maker's name or model as the firmware set it, or null. Punctuation and spaces at the end go;
 * what is left under 3 characters says nothing. OpenThread built as a reference device sets the
 * vendor name "RD:" by default (openthread src/core/config/net_diag.h), and an ESP32-C6 with
 * ESPHome's OpenThread sends exactly that.
 */
export const cleanVendor = (value: string | undefined) => {
  const cleaned = value?.trim().replace(/[\s\p{P}]+$/u, '') ?? ''
  return cleaned.length < 3 ? null : cleaned
}

/** "esp32c6" → "ESP32-C6", "efr32mg24" → "EFR32MG24" */
const chipName = (chip: string) => {
  const esp = chip.match(/^esp32([a-z]\d+)?$/i)
  if (esp) return esp[1] ? `ESP32-${esp[1].toUpperCase()}` : 'ESP32'
  return chip.toUpperCase()
}

/**
 * A model from the stack version when the firmware names no maker: OpenThread's ESP32 port writes
 * "openthread-esp32/<version>; <chip>; <build date>", which gives "ESP32-C6 (OpenThread)".
 */
export const modelFromStack = (stack: string | undefined) => {
  const [name, chip] = (stack ?? '').split(';').map((part) => part.trim())
  if (!name?.toLowerCase().startsWith('openthread') || !chip || !/^[a-z]+\d[a-z0-9]*$/i.test(chip))
    return null
  return `${chipName(chip)} (OpenThread)`
}

/** Vendor name and model of every router whose diagnostic carries one, cleaned */
export const vendorsFromDiagnostics = (diagnostics: readonly NetworkDiagnostic[]) =>
  new Map<string, VendorInfo>(
    diagnostics.flatMap((d) => {
      const vendor = cleanVendor(d.attributes.vendorName)
      const model = cleanVendor(d.attributes.vendorModel)
      const info =
        vendor || model
          ? { vendor, model }
          : { vendor: null, model: modelFromStack(d.attributes.threadStackVersion) }
      return info.vendor || info.model
        ? [[d.attributes.extAddress.toLowerCase(), info] as const]
        : []
    }),
  )

/**
 * A device of the collection. The collection carries no vendor or model (src/rest/json.cpp
 * DeviceInfo2Json); they come from the device's own network diagnostic, where there is one.
 */
export const toDeviceInfo = (item: DeviceItem, vendor: VendorInfo = NO_VENDOR): DeviceInfo => {
  const address = (item.attributes.extAddress ?? item.id).toLowerCase()
  const role = roleOf(item)
  return {
    protocol: PROTOCOL,
    address,
    name: threadName(address, item.attributes.hostname, vendor),
    role,
    model: vendor.model,
    vendor: vendor.vendor,
    power: role === 'sleepy_end_device' ? 'battery' : role === 'unknown' ? 'unknown' : 'mains',
    networkAddress: item.attributes.rloc16 ?? null,
  }
}

type Heard = { from: string; to: string; rssi: number | null; lqi: number | null; child: boolean }

/**
 * OpenThread reports 127 (OT_RADIO_RSSI_INVALID) while it has averaged no frame of the link
 * (openthread src/core/thread/link_quality.cpp RssAverager::GetAverage)
 */
export const INVALID_RSSI = 127

const validRssi = (value: number | undefined) =>
  value === undefined || value === INVALID_RSSI ? undefined : value

/** One entry of a router's table: how `router` hears `entry` */
const heard = (router: string, entry: LinkEntry, child: boolean): Heard => ({
  from: entry.extAddress.toLowerCase(),
  to: router,
  rssi: validRssi(entry.averageRssi) ?? validRssi(entry.lastRssi) ?? null,
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

/** The transmit counters of every router that sent its MAC counters */
export const countersFromDiagnostics = (
  diagnostics: readonly NetworkDiagnostic[],
  ts: number,
): TxCounters[] =>
  diagnostics.flatMap((d) => {
    const counters = d.attributes.macCounters
    if (!counters) return []
    return [
      {
        protocol: PROTOCOL,
        address: d.attributes.extAddress.toLowerCase(),
        ts,
        unicast: counters.ifOutUcastPkts,
        broadcast: counters.ifOutBroadcastPkts,
        errors: counters.ifOutErrors,
      },
    ]
  })

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
