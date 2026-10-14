// What a commissioned node's cached attributes say about the device: its network, address, name,
// role, power and battery, and which attributes are worth reading again. Pure. Attribute ids from
// the matter.js model (packages/model/src/standard/elements/*.element.ts).
import type { DeviceInfo, Role } from '~/core/types'
import { shortAddress } from '../otbr/translate'
import { type NodeData, networkInterfaceSchema } from './schemas'
import { extAddress, macAddress } from './wire'

export type MatterNode = {
  /** The node id as text, the key of the node; `nodeId` as the server sends it back */
  id: string
  nodeId: number | bigint
  available: boolean
  attributes: Record<string, unknown>
}

export const toNode = (data: NodeData): MatterNode => ({
  id: String(data.node_id),
  nodeId: data.node_id,
  available: data.available,
  attributes: data.attributes,
})

export type Network = 'thread' | 'wifi' | 'other'

const attr = (node: MatterNode, path: string) => node.attributes[path]

/** The values of one attribute on every endpoint ("*\/cluster/attribute") */
const onAnyEndpoint = (node: MatterNode, cluster: number, attribute: number) =>
  Object.entries(node.attributes)
    .filter(([path]) => path.endsWith(`/${cluster}/${attribute}`))
    .map(([, value]) => value)

/** The items of a list attribute that pass the schema; the others are skipped */
export const listOf =
  <T>(schema: { safeParse: (v: unknown) => { success: boolean; data?: T } }) =>
  (value: unknown): T[] =>
    Array.isArray(value)
      ? value.flatMap((item) => {
          const parsed = schema.safeParse(item)
          return parsed.success ? [parsed.data as T] : []
        })
      : []

/** NetworkCommissioning (49) FeatureMap: bit 0 Wi-Fi, bit 1 Thread, bit 2 Ethernet */
export const networkOf = (node: MatterNode): Network => {
  const features = attr(node, '0/49/65532')
  if (typeof features !== 'number') return 'other'
  if (features & 2) return 'thread'
  if (features & 1) return 'wifi'
  return 'other'
}

/** GeneralDiagnostics InterfaceTypeEnum: 1 Wi-Fi, 4 Thread */
const INTERFACE_TYPE = { wifi: 1, thread: 4 } as const

/**
 * The radio's address from GeneralDiagnostics NetworkInterfaces (0/51/0) HardwareAddress: the
 * extended address for Thread (as the OTBR reports it, so both adapters name one device alike),
 * the MAC address for Wi-Fi. Null without one; such a node is left out.
 */
export const addressOf = (node: MatterNode, network: Network): string | null => {
  if (network === 'other') return null
  const interfaces = listOf(networkInterfaceSchema)(attr(node, '0/51/0'))
  const read = network === 'thread' ? extAddress : macAddress
  const own = interfaces.find((i) => i['7'] === INTERFACE_TYPE[network])
  return (
    (own ? read(own['4']) : null) ??
    interfaces.map((i) => read(i['4'])).find((a) => a !== null) ??
    null
  )
}

/** ThreadNetworkDiagnostics RoutingRoleEnum (0/53/1) */
const ROLES: Record<number, Role> = {
  2: 'sleepy_end_device',
  3: 'end_device',
  4: 'router_eligible',
  5: 'router',
  6: 'router',
}

const roleOf = (node: MatterNode, network: Network): Role => {
  if (network === 'wifi') return 'end_device'
  const role = attr(node, '0/53/1')
  return typeof role === 'number' ? (ROLES[role] ?? 'unknown') : 'unknown'
}

/** ICD Management (70) OperatingMode 1: a long idle time device, which sleeps for minutes */
const isLongIdle = (node: MatterNode) => attr(node, '0/70/8') === 1

/** Never asked: a read would wait for it to wake, or wake it and cost battery */
export const isSleepy = (node: MatterNode) =>
  roleOf(node, networkOf(node)) === 'sleepy_end_device' || isLongIdle(node)

/** PowerSource (47) FeatureMap on any endpoint: bit 0 wired, bit 1 battery */
const powerOf = (node: MatterNode, role: Role): DeviceInfo['power'] => {
  const features = onAnyEndpoint(node, 47, 65532).filter((v): v is number => typeof v === 'number')
  if (features.some((f) => f & 1)) return 'mains'
  if (features.some((f) => f & 2) || role === 'sleepy_end_device') return 'battery'
  return 'unknown'
}

/** PowerSource BatPercentRemaining (47/12) counts half percent */
export const batteryOf = (node: MatterNode): number | null => {
  const value = onAnyEndpoint(node, 47, 12).find((v): v is number => typeof v === 'number')
  return value === undefined ? null : Math.round(value / 2)
}

const text = (value: unknown) =>
  typeof value === 'string' && value.trim() !== '' ? value.trim() : null

/** "0x0400", as the OTBR writes an RLOC16 */
const rloc = (value: unknown) =>
  typeof value === 'number' ? `0x${value.toString(16).padStart(4, '0')}` : null

/**
 * The device as BasicInformation (40) names it: its NodeLabel (5) if the controller set one, else
 * its ProductName (3), else its address.
 */
export const deviceInfoOf = (node: MatterNode): DeviceInfo | null => {
  const network = networkOf(node)
  const address = addressOf(node, network)
  if (network === 'other' || address === null) return null
  const role = roleOf(node, network)
  const model = text(attr(node, '0/40/3'))
  return {
    protocol: network,
    address,
    name:
      text(attr(node, '0/40/5')) ??
      model ??
      (network === 'thread' ? shortAddress(address) : address),
    role,
    model,
    vendor: text(attr(node, '0/40/1')),
    power: powerOf(node, role),
    networkAddress: network === 'thread' ? rloc(attr(node, '0/53/64')) : null,
  }
}

/** ThreadNetworkDiagnostics TxUnicastCount, TxBroadcastCount, TxErrCcaCount (MACCNT feature) */
export const THREAD_COUNTERS = { unicast: '0/53/23', broadcast: '0/53/24', errors: '0/53/36' }

/**
 * The attributes a device reports only when its subscription starts (matterjs-server
 * ThreadDetailsPoller.ts) or never on change (quality C), so Funkloch reads them itself: the
 * neighbor table and the transmit counters of a Thread device, the BSSID and RSSI of a Wi-Fi one.
 */
export const signalPaths = (node: MatterNode): string[] => {
  const network = networkOf(node)
  if (network === 'wifi') return ['0/54/0', '0/54/4']
  if (network !== 'thread') return []
  const counters = Object.values(THREAD_COUNTERS)
  return ['0/53/7', ...(counters.every((path) => path in node.attributes) ? counters : [])]
}

/** What to read of a node now: nothing while it is offline or sleeps */
export const pollPaths = (node: MatterNode): string[] =>
  node.available && !isSleepy(node) ? signalPaths(node) : []
