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
}

export type AdapterStatus = { connected: boolean; error: string | null; since: number | null }

export type Adapter = {
  meta: ProtocolMeta
  /** Starts listening; observations go to `emit`. Returns a function that stops the adapter. */
  start: (emit: (observation: Observation) => void) => () => Promise<void>
  status: () => AdapterStatus
  /** Asks for a fresh topology now, if the protocol can */
  requestTopology?: () => void
}
