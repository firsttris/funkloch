import type { Measurement, Observation } from '~/core/types'
import type { Db } from '~/db/client'
import { checkReachability } from '~/db/reachability'
import {
  applyDevices,
  type SeenInput,
  storeBatch,
  storeBridgeState,
  storeReportedAvailability,
  storeTopology,
} from '~/db/store'
import type { Log } from './log'

export const FLUSH_INTERVAL = 1000

/**
 * Takes the observations of all adapters. Measurements and signs of life are collected and
 * written once a second in one transaction; everything else is written at once, after the
 * pending batch, so the order stays intact.
 */
export const createIngest = (db: Db, log: Log, clock: () => number = Date.now) => {
  let measurements: Measurement[] = []
  let seen: SeenInput[] = []

  const guarded = (what: string, write: () => void) => {
    try {
      write()
    } catch (error) {
      log.error({ err: error }, `could not store ${what}`)
    }
  }

  const flush = () => {
    if (measurements.length === 0 && seen.length === 0) return
    const batch = { measurements, seen }
    measurements = []
    seen = []
    guarded('measurements', () => storeBatch(db, batch.measurements, batch.seen))
  }

  const apply = (observation: Observation) => {
    switch (observation.kind) {
      case 'devices':
        return guarded('devices', () =>
          applyDevices(db, observation.protocol, observation.devices, observation.ts),
        )
      case 'availability': {
        const { protocol, address, online, ts } = observation.report
        return guarded('availability', () => {
          storeReportedAvailability(db, protocol, address, online, ts)
          checkReachability(db, clock())
        })
      }
      case 'topology':
        return guarded('topology', () => storeTopology(db, observation.topology))
      case 'bridge':
        return guarded('bridge state', () =>
          storeBridgeState(db, observation.protocol, observation.online, observation.ts),
        )
      case 'measurement':
      case 'seen':
        return
    }
  }

  // Samples are keyed by device and millisecond; a burst within one millisecond moves on by 1 ms
  const lastTs = new Map<string, number>()
  const uniqueTs = (measurement: Measurement): Measurement => {
    const key = `${measurement.protocol}|${measurement.address}`
    const ts = Math.max(measurement.ts, (lastTs.get(key) ?? -1) + 1)
    lastTs.set(key, ts)
    return ts === measurement.ts ? measurement : { ...measurement, ts }
  }

  const emit = (observation: Observation) => {
    if (observation.kind === 'measurement') {
      measurements.push(uniqueTs(observation.measurement))
      return
    }
    if (observation.kind === 'seen') {
      seen.push(observation)
      return
    }
    flush()
    apply(observation)
  }

  const timer = setInterval(flush, FLUSH_INTERVAL)
  const stop = () => {
    clearInterval(timer)
    flush()
  }
  return { emit, flush, stop }
}
