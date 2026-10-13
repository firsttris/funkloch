// The protocol-free model every adapter translates into. A protocol is only an id here; what it
// means (labels, raw units, score formula) lives in its adapter.

export type ProtocolId = string

export type Role =
  | 'coordinator'
  | 'border_router'
  | 'router'
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
  | { kind: 'devices'; protocol: ProtocolId; ts: number; devices: DeviceInfo[] }
  | { kind: 'measurement'; measurement: Measurement }
  | { kind: 'availability'; report: AvailabilityReport }
  | { kind: 'topology'; topology: Topology }
  | { kind: 'bridge'; protocol: ProtocolId; ts: number; online: boolean }

export type Band = 'good' | 'mid' | 'weak'

export type Status = Band | 'offline' | 'unknown'

export type Trend = 'down' | 'flat' | 'up' | 'none'

export const HOUR = 3_600_000
export const MINUTE = 60_000
export const DAY = 24 * HOUR
