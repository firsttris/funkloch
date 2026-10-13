import { band, type Thresholds } from './score'
import type { DeviceInfo, Status } from './types'

export type DeviceDiff = { added: DeviceInfo[]; removed: string[]; changed: DeviceInfo[] }

const sameInfo = (a: DeviceInfo, b: DeviceInfo) =>
  a.name === b.name &&
  a.role === b.role &&
  a.model === b.model &&
  a.vendor === b.vendor &&
  a.power === b.power &&
  a.networkAddress === b.networkAddress

/** Compares a full device list from an adapter with the devices already known for its protocol. */
export const diffDevices = (
  known: readonly DeviceInfo[],
  incoming: readonly DeviceInfo[],
): DeviceDiff => {
  const knownByAddress = new Map(known.map((d) => [d.address, d]))
  const incomingAddresses = new Set(incoming.map((d) => d.address))
  return {
    added: incoming.filter((d) => !knownByAddress.has(d.address)),
    changed: incoming.filter((d) => {
      const before = knownByAddress.get(d.address)
      return before !== undefined && !sameInfo(before, d)
    }),
    removed: known.filter((d) => !incomingAddresses.has(d.address)).map((d) => d.address),
  }
}

/** The traffic light of a device: offline wins, then the band of its latest hourly median. */
export const deviceStatus = (
  online: boolean,
  score: number | null,
  thresholds?: Thresholds,
): Status => {
  if (!online) return 'offline'
  return score === null ? 'unknown' : band(score, thresholds)
}

/** The device a device is connected through: its parent in the latest topology, if any. */
export const parentOf = (
  address: string,
  links: readonly { from: string; to: string; parent: boolean }[],
): string | null => links.find((l) => l.from === address && l.parent)?.to ?? null
