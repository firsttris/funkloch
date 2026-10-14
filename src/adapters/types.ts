import type { Observation, ProtocolId } from '~/core/types'

/** What the UI and the core need to know about a protocol without knowing the protocol. */
export type ProtocolMeta = {
  id: ProtocolId
  label: string
  /** The protocol's own signal value shown in charts */
  raw: { label: string; min: number; max: number; unit: string }
  /** Raw value at a score, to draw a score threshold on a raw chart; null when not invertible */
  rawAtScore: ((score: number) => number) | null
  /** The raw values as shown in the device list, e.g. "LQI 38" */
  formatRaw: (sample: { raw: number; lqi: number | null; rssi: number | null }) => string
  /** Score of a link in a topology, for its colour; null when the link carries no value */
  linkScore: (link: { lqi: number | null; rssi: number | null }) => number | null
  /** The short label on a link in the network map, e.g. "38" or "1 · −88" */
  formatLink: (link: { lqi: number | null; rssi: number | null }) => string
  /** Both directions of a link in a text, e.g. "LQI 64/15" or "−75/−86 dBm" */
  formatLinkPair: (
    there: { lqi: number | null; rssi: number | null } | null,
    back: { lqi: number | null; rssi: number | null } | null,
  ) => string
}

export type AdapterStatus = { connected: boolean; error: string | null; since: number | null }

export type Adapter = {
  /** Stable id, e.g. in /healthz */
  id: string
  label: string
  /** The networks it measures and maps; it may also describe devices of others (see Matter) */
  protocols: ProtocolMeta[]
  /** Starts listening; observations go to `emit`. Returns a function that stops the adapter. */
  start: (emit: (observation: Observation) => void) => () => Promise<void>
  status: () => AdapterStatus
  /** Asks for a fresh topology of one of its protocols now, if it can */
  requestTopology?: (protocol: ProtocolId) => void
}

/** Whether the adapter measures and maps the protocol */
export const delivers = (adapter: Adapter, protocol: ProtocolId) =>
  adapter.protocols.some((meta) => meta.id === protocol)
