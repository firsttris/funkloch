// Turns one Zigbee2MQTT message into observations. Pure: the adapter passes in the device names it
// knows and the receive time.
import type { DeviceInfo, Link, Observation, PowerSource, Role } from '~/core/types'
import { zigbeeMeta, zigbeeScore } from './meta'
import {
  availabilitySchema,
  type BridgeDevice,
  bridgeDevicesSchema,
  bridgeStateSchema,
  deviceStateSchema,
  type NetworkmapResponse,
  networkmapResponseSchema,
} from './schemas'

const PROTOCOL = zigbeeMeta.id

export type ParseContext = {
  baseTopic: string
  /** friendly_name → IEEE address, from the last bridge/devices */
  byName: ReadonlyMap<string, string>
  now: number
}

export type ParseResult = {
  observations: Observation[]
  /** Set when the message was bridge/devices, so the adapter can refresh its name map */
  devices?: BridgeDevice[]
  /** A payload that did not match its schema */
  invalid?: string
}

const ROLES: Record<BridgeDevice['type'], Role> = {
  Coordinator: 'coordinator',
  Router: 'router',
  EndDevice: 'end_device',
  Unknown: 'unknown',
  GreenPower: 'unknown',
}

const powerSource = (value: string | null | undefined): PowerSource => {
  if (!value) return 'unknown'
  if (/battery/i.test(value)) return 'battery'
  return /mains|dc source/i.test(value) ? 'mains' : 'unknown'
}

export const toDeviceInfo = (device: BridgeDevice): DeviceInfo => ({
  protocol: PROTOCOL,
  address: device.ieee_address.toLowerCase(),
  name: device.friendly_name,
  role: ROLES[device.type],
  model: device.definition?.model ?? device.model_id ?? null,
  vendor: device.definition?.vendor ?? device.manufacturer ?? null,
  power: device.type === 'Coordinator' ? 'mains' : powerSource(device.power_source),
  networkAddress: `0x${device.network_address.toString(16).toUpperCase().padStart(4, '0')}`,
})

/**
 * Links from the raw network map. Each link is an entry in the neighbor table of `target` about
 * `source`; relationship 1 makes `target` the parent of `source`, relationship 0 the other way
 * round. A pair seen from both sides keeps the first LQI and the parent flag of either.
 */
export const toLinks = (map: NonNullable<NetworkmapResponse['data']>['value']): Link[] => {
  const byPair = new Map<string, Link>()
  for (const link of map.links) {
    if (link.relationship > 3) continue
    const source = link.source.ieeeAddr.toLowerCase()
    const target = link.target.ieeeAddr.toLowerCase()
    const sourceIsParent = link.relationship === 0
    const from = sourceIsParent ? target : source
    const to = sourceIsParent ? source : target
    const parent = link.relationship === 0 || link.relationship === 1
    const lqi = link.lqi ?? link.linkquality ?? null
    const key = `${from}>${to}`
    const existing = byPair.get(key)
    byPair.set(
      key,
      existing
        ? { ...existing, parent: existing.parent || parent, lqi: existing.lqi ?? lqi }
        : { from, to, lqi, rssi: null, parent },
    )
  }
  return [...byPair.values()]
}

const parseJson = (text: string): unknown => {
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

const invalid = (topic: string, error: { message: string }): ParseResult => ({
  observations: [],
  invalid: `${topic}: ${error.message}`,
})

const parseBridge = (ctx: ParseContext, subtopic: string, payload: unknown): ParseResult => {
  const topic = `bridge/${subtopic}`
  if (subtopic === 'devices') {
    const result = bridgeDevicesSchema.safeParse(payload)
    if (!result.success) return invalid(topic, result.error)
    return {
      devices: result.data,
      observations: [
        {
          kind: 'devices',
          protocol: PROTOCOL,
          ts: ctx.now,
          devices: result.data.map(toDeviceInfo),
        },
      ],
    }
  }
  if (subtopic === 'state') {
    const result = bridgeStateSchema.safeParse(payload)
    if (!result.success) return invalid(topic, result.error)
    return {
      observations: [{ kind: 'bridge', protocol: PROTOCOL, ts: ctx.now, online: result.data }],
    }
  }
  if (subtopic === 'response/networkmap') {
    const result = networkmapResponseSchema.safeParse(payload)
    if (!result.success) return invalid(topic, result.error)
    if (result.data.status !== 'ok' || !result.data.data) return { observations: [] }
    const links = toLinks(result.data.data.value)
    return {
      observations: [{ kind: 'topology', topology: { protocol: PROTOCOL, ts: ctx.now, links } }],
    }
  }
  return { observations: [] }
}

const parseDeviceState = (
  ctx: ParseContext,
  address: string,
  payload: unknown,
  retained: boolean,
): ParseResult => {
  // A retained state is an old message the broker keeps, not a sign of life
  if (retained) return { observations: [] }
  const result = deviceStateSchema.safeParse(payload)
  if (!result.success) return invalid(address, result.error)
  const { linkquality, battery } = result.data
  if (linkquality === null || linkquality === undefined) {
    return {
      observations: [
        { kind: 'seen', protocol: PROTOCOL, address, ts: ctx.now, battery: battery ?? null },
      ],
    }
  }
  return {
    observations: [
      {
        kind: 'measurement',
        measurement: {
          protocol: PROTOCOL,
          address,
          ts: ctx.now,
          score: zigbeeScore(linkquality),
          raw: linkquality,
          lqi: linkquality,
          rssi: null,
          battery: battery ?? null,
          source: 'message',
        },
      },
    ],
  }
}

const AVAILABILITY_SUFFIX = '/availability'

/** Routes a message by topic. Friendly names may contain slashes, so names are looked up whole. */
export const parseMessage = (
  ctx: ParseContext,
  topic: string,
  text: string,
  retained: boolean,
): ParseResult => {
  const prefix = `${ctx.baseTopic}/`
  if (!topic.startsWith(prefix)) return { observations: [] }
  const rest = topic.slice(prefix.length)
  const payload = parseJson(text)

  if (rest.startsWith('bridge/')) return parseBridge(ctx, rest.slice('bridge/'.length), payload)

  const address = ctx.byName.get(rest)
  if (address) return parseDeviceState(ctx, address, payload, retained)

  if (rest.endsWith(AVAILABILITY_SUFFIX)) {
    const name = rest.slice(0, -AVAILABILITY_SUFFIX.length)
    const owner = ctx.byName.get(name)
    // An empty payload clears the retained topic when a device is renamed or removed
    if (!owner || text === '') return { observations: [] }
    const result = availabilitySchema.safeParse(payload)
    if (!result.success) return invalid(topic, result.error)
    return {
      observations: [
        {
          kind: 'availability',
          report: { protocol: PROTOCOL, address: owner, ts: ctx.now, online: result.data },
        },
      ],
    }
  }
  return { observations: [] }
}

/** friendly_name → IEEE address */
export const nameMap = (devices: readonly BridgeDevice[]) =>
  new Map(devices.map((d) => [d.friendly_name, d.ieee_address.toLowerCase()]))
