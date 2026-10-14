// The nodes of matterjs-server as observations. Pure: the adapter passes in its node cache, the
// border routers the server found and the time.
import { linearScore } from '~/core/score'
import type { DeviceInfo, Link, Measurement, Observation, TxCounters } from '~/core/types'
import { withUplinks } from '~/core/uplinks'
import { THREAD_RSSI_MAX, THREAD_RSSI_MIN, threadMeta, threadScore } from '../otbr/meta'
import { threadName } from '../otbr/translate'
import { wifiMeta, wifiScore } from './meta'
import {
  addressOf,
  batteryOf,
  deviceInfoOf,
  listOf,
  type MatterNode,
  networkOf,
  THREAD_COUNTERS,
} from './nodes'
import { type BorderRouter, type Neighbor, neighborSchema, networkInfoSchema } from './schemas'
import { extAddress, macAddress, octetText } from './wire'

/** A Thread node with its address */
type ThreadNode = { node: MatterNode; address: string; info: DeviceInfo }

const threadNodes = (nodes: readonly MatterNode[]): ThreadNode[] =>
  nodes.flatMap((node) => {
    const info = deviceInfoOf(node)
    return info?.protocol === 'thread' ? [{ node, address: info.address, info }] : []
  })

/** How `to` hears `from`; `own`: measured by the child itself, of its parent */
type Heard = {
  from: string
  to: string
  rssi: number | null
  lqi: number | null
  child: boolean
  own: boolean
}

/** AverageRssi, else LastRssi; null and positive values (127: OpenThread's "none") are none */
const rssiOf = (n: Neighbor) =>
  [n['6'], n['7']].find((v): v is number => typeof v === 'number' && v < 0) ?? null

/** The Lqi field is 0–255 in the spec; OpenThread fills in its link quality 0–3 */
const lqiOf = (n: Neighbor) =>
  typeof n['5'] === 'number' && n['5'] >= 0 && n['5'] <= 3 ? n['5'] : null

const CHILD_ROLES = new Set(['end_device', 'sleepy_end_device', 'router_eligible'])

const neighborsOf = listOf<Neighbor>(neighborSchema)

/**
 * Every entry of every neighbor table: how the node hears its neighbor. A child also hears its
 * parent, the full Thread device among its neighbors; that counts for the child's own link when the
 * parent cannot be read (a border router of another maker).
 */
const heardEntries = (thread: readonly ThreadNode[]): Heard[] =>
  thread.flatMap(({ node, address, info }) =>
    neighborsOf(node.attributes['0/53/7']).flatMap((n) => {
      const neighbor = extAddress(n['0'])
      if (!neighbor || neighbor === address) return []
      const value = { rssi: rssiOf(n), lqi: lqiOf(n) }
      const heard: Heard = {
        from: neighbor,
        to: address,
        ...value,
        child: n['13'] === true,
        own: false,
      }
      const parent = CHILD_ROLES.has(info.role) && n['13'] !== true && n['11'] !== false
      return parent
        ? [heard, { from: address, to: neighbor, ...value, child: true, own: true }]
        : [heard]
    }),
  )

const scoreOf = (h: Heard) =>
  h.rssi === null
    ? null
    : h.lqi === null
      ? linearScore(h.rssi, THREAD_RSSI_MIN, THREAD_RSSI_MAX)
      : threadScore(h.rssi, h.lqi)

/** The parent's view of a child first, then the child's view of its parent, then the best score */
const rank = (h: Heard) => (h.child ? (h.own ? 1 : 2) : 0)

const bestPerDevice = (entries: readonly Heard[], roots: ReadonlySet<string>) => {
  const best = new Map<string, Heard>()
  for (const entry of entries) {
    if (roots.has(entry.from)) continue
    const current = best.get(entry.from)
    const preferred =
      !current ||
      rank(entry) > rank(current) ||
      (rank(entry) === rank(current) && (scoreOf(entry) ?? -1) > (scoreOf(current) ?? -1))
    if (preferred) best.set(entry.from, entry)
  }
  return best
}

const describeUnknown = (
  address: string,
  entries: readonly Heard[],
  router: BorderRouter | undefined,
): DeviceInfo => {
  const child = entries.some((h) => h.from === address && h.child && !h.own)
  return {
    protocol: threadMeta.id,
    address,
    name: threadName(address, router?.hostname, {
      vendor: router?.vendorName ?? null,
      model: router?.modelName ?? null,
    }),
    role: router ? 'border_router' : child ? 'end_device' : 'router',
    model: router?.modelName ?? null,
    vendor: router?.vendorName ?? null,
    power: router ? 'mains' : 'unknown',
    networkAddress: null,
  }
}

/**
 * Devices, measurements and links of the Thread mesh from the nodes' neighbor tables. Border
 * routers the server found over mDNS are the root of the map; they and the other devices that are
 * no node of this controller show up through the tables that hear them.
 */
export const threadFromNodes = (
  nodes: readonly MatterNode[],
  borderRouters: readonly BorderRouter[],
  ts: number,
) => {
  const thread = threadNodes(nodes)
  const entries = heardEntries(thread)
  const routers = new Map(borderRouters.map((r) => [r.extAddressHex.toLowerCase(), r]))
  const roots = new Set([...routers.keys()])
  const known = new Set(thread.map((t) => t.address))
  const heard = new Set(entries.flatMap((h) => [h.from, h.to]))

  const devices: DeviceInfo[] = [
    ...thread.map(({ info }) =>
      roots.has(info.address) ? { ...info, role: 'border_router' as const } : info,
    ),
    ...[...heard]
      .filter((a) => !known.has(a))
      .map((a) => describeUnknown(a, entries, routers.get(a))),
  ]

  const best = bestPerDevice(entries, roots)
  const battery = new Map(thread.map(({ node, address }) => [address, batteryOf(node)]))
  const measurements: Measurement[] = [...best.values()].flatMap((h) => {
    const score = scoreOf(h)
    if (score === null || h.rssi === null) return []
    return [
      {
        protocol: threadMeta.id,
        address: h.from,
        ts,
        score,
        raw: h.rssi,
        lqi: h.lqi,
        rssi: h.rssi,
        battery: battery.get(h.from) ?? null,
        source: 'neighbor-table',
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
  return { devices, measurements, links: withUplinks(links, roots, threadMeta.linkScore) }
}

/** WiFiNetworkDiagnostics Rssi (0/54/4): −120 to 0 dBm, null while not connected */
const wifiRssi = (node: MatterNode) => {
  const value = node.attributes['0/54/4']
  return typeof value === 'number' && value < 0 && value >= -120 ? value : null
}

/** The SSID of the network the node is connected to (NetworkCommissioning Networks, 0/49/1) */
const ssidOf = (node: MatterNode) => {
  const connected = listOf(networkInfoSchema)(node.attributes['0/49/1']).find((n) => n['1'])
  return connected ? octetText(connected['0']) : null
}

/** An access point by its SSID and the end of its BSSID, which tells the radios of a mesh apart */
const accessPoint = (bssid: string, ssid: string | null): DeviceInfo => ({
  protocol: wifiMeta.id,
  address: bssid,
  name: ssid ? `${ssid} · ${bssid.slice(-5)}` : bssid,
  role: 'access_point',
  model: null,
  vendor: null,
  power: 'mains',
  networkAddress: null,
})

/** Wi-Fi stations with their RSSI, hung on the access point (BSSID) they are connected to */
export const wifiFromNodes = (nodes: readonly MatterNode[], ts: number) => {
  const stations = nodes.flatMap((node) => {
    const info = deviceInfoOf(node)
    return info?.protocol === 'wifi' ? [{ node, info }] : []
  })
  const points = new Map<string, DeviceInfo>()
  const measurements: Measurement[] = []
  const links: Link[] = []
  for (const { node, info } of stations) {
    const rssi = wifiRssi(node)
    const bssid = macAddress(node.attributes['0/54/0'])
    if (bssid && !points.has(bssid)) points.set(bssid, accessPoint(bssid, ssidOf(node)))
    if (rssi !== null) {
      measurements.push({
        protocol: wifiMeta.id,
        address: info.address,
        ts,
        score: wifiScore(rssi),
        raw: rssi,
        lqi: null,
        rssi,
        battery: batteryOf(node),
        source: 'wifi-diagnostics',
      })
    }
    if (bssid) links.push({ from: info.address, to: bssid, lqi: null, rssi, parent: true })
  }
  return { devices: [...stations.map((s) => s.info), ...points.values()], measurements, links }
}

/** The transmit counters of every Thread node that reads them (ThreadNetworkDiagnostics MACCNT) */
export const threadCounters = (nodes: readonly MatterNode[], ts: number): TxCounters[] =>
  threadNodes(nodes).flatMap(({ node, address }) => {
    const [unicast, broadcast, errors] = [
      THREAD_COUNTERS.unicast,
      THREAD_COUNTERS.broadcast,
      THREAD_COUNTERS.errors,
    ].map((path) => node.attributes[path])
    if (typeof unicast !== 'number' || typeof broadcast !== 'number' || typeof errors !== 'number')
      return []
    return [{ protocol: threadMeta.id, address, ts, unicast, broadcast, errors }]
  })

/** The channel of the Thread network (ThreadNetworkDiagnostics Channel, 0/53/0) */
export const threadChannel = (nodes: readonly MatterNode[]): number | null => {
  const channel = threadNodes(nodes)
    .map(({ node }) => node.attributes['0/53/0'])
    .find((c): c is number => typeof c === 'number' && c >= 11 && c <= 26)
  return channel ?? null
}

/** Whether each node with an address is reachable, as the server's subscription says */
export const availabilityOf = (nodes: readonly MatterNode[]) =>
  nodes.flatMap((node) => {
    const network = networkOf(node)
    const address = addressOf(node, network)
    return address && network !== 'other'
      ? [{ protocol: network, address, online: node.available }]
      : []
  })

/** What Matter knows best when the OTBR describes the same Thread devices */
export const MATTER_SOURCE = { id: 'matter', prefer: ['name', 'vendor', 'model', 'power'] } as const

const deviceList = (protocol: string, devices: DeviceInfo[], ts: number): Observation[] =>
  devices.length === 0
    ? []
    : [{ kind: 'devices', protocol, ts, devices, complete: false, source: MATTER_SOURCE }]

/** The device lists of the given networks, as the nodes describe themselves */
export const deviceObservations = (
  nodes: readonly MatterNode[],
  ts: number,
  protocols: readonly string[] = [threadMeta.id, wifiMeta.id],
): Observation[] => {
  const infos = nodes.flatMap((node) => deviceInfoOf(node) ?? [])
  return protocols.flatMap((protocol) =>
    deviceList(
      protocol,
      infos.filter((d) => d.protocol === protocol),
      ts,
    ),
  )
}

/**
 * The battery level each node's PowerSource holds, Thread and Wi-Fi alike. It reaches the device
 * even while no reading of Matter's carries it (the OTBR measures Thread) and while the level does
 * not change, so the server sends no report of it.
 */
export const batteryObservations = (nodes: readonly MatterNode[], ts: number): Observation[] =>
  nodes.flatMap((node) => {
    const info = deviceInfoOf(node)
    const battery = batteryOf(node)
    return info && battery !== null
      ? [{ kind: 'battery' as const, protocol: info.protocol, address: info.address, ts, battery }]
      : []
  })

/** What a node tells about itself: its device and its battery level */
export const nodeObservations = (nodes: readonly MatterNode[], ts: number): Observation[] => [
  ...deviceObservations(nodes, ts),
  ...batteryObservations(nodes, ts),
]

/**
 * Everything one poll gathered: per network the devices, readings and map, and every battery
 * level. With `threadSignal` off (the OTBR measures Thread) only the Thread devices themselves.
 */
export const cycleObservations = (
  nodes: readonly MatterNode[],
  borderRouters: readonly BorderRouter[],
  ts: number,
  threadSignal: boolean,
): Observation[] => {
  const networks = [{ protocol: wifiMeta.id, ...wifiFromNodes(nodes, ts) }]
  if (threadSignal)
    networks.push({ protocol: threadMeta.id, ...threadFromNodes(nodes, borderRouters, ts) })
  const signal = networks.flatMap(({ protocol, devices, measurements, links }): Observation[] => [
    ...deviceList(protocol, devices, ts),
    ...measurements.map((measurement) => ({ kind: 'measurement' as const, measurement })),
    ...(links.length > 0 ? [{ kind: 'topology' as const, topology: { protocol, ts, links } }] : []),
  ])
  const batteries = batteryObservations(nodes, ts)
  if (!threadSignal)
    return [...deviceObservations(nodes, ts, [threadMeta.id]), ...signal, ...batteries]
  const channel = threadChannel(nodes)
  return [
    ...signal,
    ...batteries,
    ...threadCounters(nodes, ts).map((counters) => ({ kind: 'counters' as const, counters })),
    ...(channel === null ? [] : [{ kind: 'channel' as const, protocol: threadMeta.id, channel }]),
  ]
}
