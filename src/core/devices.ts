import { band, type Thresholds } from './score'
import type { DeviceField, DeviceInfo, Status } from './types'

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

/** One adapter's description of a device, with the fields that adapter knows best */
export type Described = { source: string; info: DeviceInfo; prefer: readonly DeviceField[] }

const FIELDS: readonly DeviceField[] = [
  'name',
  'role',
  'model',
  'vendor',
  'power',
  'networkAddress',
]

const knows = (value: DeviceInfo[DeviceField]) => value !== null && value !== 'unknown'

/**
 * A device as several adapters describe it, field by field: the value of an adapter that prefers
 * the field and knows it, else of the first adapter (by id, so the result does not depend on
 * which one answered last) that knows it, else of the first adapter.
 */
export const mergeDescribed = (described: readonly Described[]): DeviceInfo => {
  const sorted = [...described].sort((a, b) => a.source.localeCompare(b.source))
  const first = sorted[0]
  if (!first) throw new Error('mergeDescribed needs at least one description')
  const pick = <F extends DeviceField>(field: F): DeviceInfo[F] => {
    const preferred = sorted.find((d) => d.prefer.includes(field) && knows(d.info[field]))
    const known = preferred ?? sorted.find((d) => knows(d.info[field])) ?? first
    return known.info[field]
  }
  const merged = { ...first.info }
  for (const field of FIELDS) Object.assign(merged, { [field]: pick(field) })
  return merged
}
