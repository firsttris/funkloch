import type { Observation, ProtocolId } from '~/core/types'

/** What the UI and the core need to know about a protocol without knowing the protocol. */
export type ProtocolMeta = {
  id: ProtocolId
  label: string
  /** The protocol's own signal value shown in charts */
  raw: { label: string; min: number; max: number; unit: string }
  /** Raw value at a score, to draw a score threshold on a raw chart; null when not invertible */
  rawAtScore: ((score: number) => number) | null
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
