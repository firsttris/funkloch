// The protocol-free model every adapter translates into. A protocol is only an id here; what it
// means (labels, raw units, score formula) lives in its adapter.

export type ProtocolId = string

export type Role =
  | 'coordinator'
  | 'border_router'
  | 'router'
  /** A Thread child that may become a router (REED) when the mesh needs one */
  | 'router_eligible'
  | 'end_device'
  | 'sleepy_end_device'
  | 'unknown'

export type PowerSource = 'mains' | 'battery' | 'unknown'

export type DeviceInfo = {
  protocol: ProtocolId
  /** Stable address within the protocol: IEEE address (Zigbee), extended address (Thread) */
  address: string
  name: string
  role: Role
  model: string | null
  vendor: string | null
  power: PowerSource
  /** Short network address, if the protocol has one */
  networkAddress: string | null
}

export type Measurement = {
  protocol: ProtocolId
  address: string
  ts: number
  /** 0 to 100, comparable across protocols */
  score: number
  /** The protocol's own primary value (LQI for Zigbee, RSSI for Thread), for charts */
  raw: number
  lqi: number | null
  rssi: number | null
  battery: number | null
  source: string
}

export type AvailabilityReport = {
  protocol: ProtocolId
  address: string
  ts: number
  online: boolean
}

export type Link = {
  from: string
  to: string
  lqi: number | null
  rssi: number | null
  /** `to` is the parent of `from` */
  parent: boolean
}

export type Topology = {
  protocol: ProtocolId
  ts: number
  links: Link[]
}

/** What an adapter hands to the core. */
export type Observation =
  /**
   * The devices of a protocol. A complete list (Zigbee2MQTT's bridge/devices) also removes the
   * devices missing from it; a partial one (Thread: only the devices that answered) only adds and
   * updates, so a device that drops out turns offline through its silence instead.
   */
  | { kind: 'devices'; protocol: ProtocolId; ts: number; devices: DeviceInfo[]; complete: boolean }
  | { kind: 'measurement'; measurement: Measurement }
  /** A message without a signal value: the device is alive */
  | { kind: 'seen'; protocol: ProtocolId; address: string; ts: number; battery: number | null }
  | { kind: 'availability'; report: AvailabilityReport }
  | { kind: 'topology'; topology: Topology }
  | { kind: 'bridge'; protocol: ProtocolId; ts: number; online: boolean }
  /** Energy per 2.4 GHz channel (11–26) in dBm, from an energy scan */
  | {
      kind: 'channels'
      protocol: ProtocolId
      ts: number
      channels: { channel: number; energy: number }[]
    }
  /** The channel the network runs on */
  | { kind: 'channel'; protocol: ProtocolId; channel: number }

export type Band = 'good' | 'mid' | 'weak'

export type Status = Band | 'offline' | 'unknown'

export type Trend = 'down' | 'flat' | 'up' | 'none'

export const HOUR = 3_600_000
export const MINUTE = 60_000
export const DAY = 24 * HOUR
