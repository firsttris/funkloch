// Deterministic demo data: the same seed and the same `now` give the same history, so the
// screenshots and E2E tests see the same pages.
import { threadScore } from '~/adapters/otbr/meta'
import { zigbeeScore } from '~/adapters/zigbee2mqtt/meta'
import { clampScore } from '~/core/score'
import {
  DAY,
  type DeviceInfo,
  HOUR,
  type Link,
  type Measurement,
  MINUTE,
  type TxCounters,
} from '~/core/types'
import { DEMO_DEVICES, type DemoDevice, THREAD_BORDER_ROUTER, ZIGBEE_COORDINATOR } from './devices'

export const HISTORY_DAYS = 30

/** mulberry32: a small seeded PRNG */
export const random = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

/** Score level at `hoursAgo` from the device's [hours before now, score] points */
export const levelAt = (points: [number, number][], hoursAgo: number) => {
  const sorted = [...points].sort((a, b) => b[0] - a[0])
  const first = sorted[0] as [number, number]
  if (hoursAgo >= first[0]) return first[1]
  for (let i = 1; i < sorted.length; i++) {
    const [h1, s1] = sorted[i - 1] as [number, number]
    const [h2, s2] = sorted[i] as [number, number]
    if (hoursAgo >= h2) return s1 + ((s2 - s1) * (h1 - hoursAgo)) / (h1 - h2)
  }
  return (sorted.at(-1) as [number, number])[1]
}

const isOffline = (device: DemoDevice, hoursAgo: number) =>
  (device.offline ?? []).some(([from, to]) => hoursAgo <= from && hoursAgo > to)

/** Thread link quality from a score, the inverse of the cap in threadScore */
const threadLqi = (score: number) => (score >= 60 ? 3 : score >= 25 ? 2 : score > 0 ? 1 : 0)

export const measurementAt = (device: DemoDevice, ts: number, score: number): Measurement => {
  const target = clampScore(score)
  if (device.protocol === 'zigbee') {
    const lqi = Math.round((target / 100) * 255)
    return {
      protocol: 'zigbee',
      address: device.address,
      ts,
      score: zigbeeScore(lqi),
      raw: lqi,
      lqi,
      rssi: null,
      battery: device.power === 'battery' ? 64 : null,
      source: 'demo',
    }
  }
  const rssi = Math.round(-100 + target / 2)
  const lqi = threadLqi(target)
  return {
    protocol: 'thread',
    address: device.address,
    ts,
    score: threadScore(rssi, lqi),
    raw: rssi,
    lqi,
    rssi,
    battery: null,
    source: 'demo',
  }
}

/** The score a device has at `ts`, with noise from `rnd` */
export const scoreAt = (device: DemoDevice, ts: number, now: number, rnd: () => number) => {
  const hoursAgo = (now - ts) / HOUR
  const hourOfDay = new Date(ts).getHours()
  const dip = device.eveningDip && hourOfDay >= 19 && hourOfDay <= 22 ? device.eveningDip : 0
  return levelAt(device.level, hoursAgo) - dip + (rnd() - 0.5) * 2 * device.noise
}

/** Every message of the last 30 days up to `now`, except the offline stretches */
export const history = (device: DemoDevice, now: number, seed: number) => {
  const rnd = random(seed)
  const step = device.interval * MINUTE
  const measurements: Measurement[] = []
  // Align to the interval so a later `now` continues the same series
  for (let ts = Math.ceil((now - HISTORY_DAYS * DAY) / step) * step; ts <= now; ts += step) {
    const jitter = Math.round((rnd() - 0.5) * step * 0.3)
    const at = Math.min(ts + jitter, now)
    if (isOffline(device, (now - at) / HOUR)) continue
    measurements.push(measurementAt(device, at, scoreAt(device, at, now, rnd)))
  }
  return measurements
}

/** How often the demo reads the transmit counters, and the frames a router sends in that time */
export const COUNTER_EVERY = 15 * MINUTE
const FRAMES_PER_READING = 140

export type CounterTotals = Pick<TxCounters, 'unicast' | 'broadcast' | 'errors'>

/** The counters after one more interval: about 140 frames, each failing at the device's rate */
export const counterStep = (
  device: DemoDevice,
  total: CounterTotals,
  rnd: () => number,
): CounterTotals => {
  const frames = Math.round(FRAMES_PER_READING * (0.8 + rnd() * 0.4))
  const unicast = Math.round(frames * 0.7)
  return {
    unicast: total.unicast + unicast,
    broadcast: total.broadcast + frames - unicast,
    errors: total.errors + Math.floor(frames * (device.txErrors ?? 0) + rnd()),
  }
}

/** Counter readings of a device with a transmit error rate over the last `days`, from zero */
export const counterHistory = (device: DemoDevice, now: number, days: number, seed: number) => {
  if (device.txErrors === undefined) return []
  const rnd = random(seed)
  const readings: TxCounters[] = []
  let total: CounterTotals = { unicast: 0, broadcast: 0, errors: 0 }
  const first = Math.ceil((now - days * DAY) / COUNTER_EVERY) * COUNTER_EVERY
  for (let ts = first; ts <= now; ts += COUNTER_EVERY) {
    total = counterStep(device, total, rnd)
    readings.push({ protocol: device.protocol, address: device.address, ts, ...total })
  }
  return readings
}

/** Offline and online changes from the offline stretches, at the silence limit after the last message */
export const availabilityChanges = (device: DemoDevice, now: number) =>
  (device.offline ?? []).flatMap(([from, to]) => {
    const wentOffline = now - from * HOUR + Math.max(3 * device.interval, 30) * MINUTE
    const changes = [{ ts: wentOffline, online: false }]
    return to > 0 ? [...changes, { ts: now - to * HOUR, online: true }] : changes
  })

export const toDeviceInfo = (device: DemoDevice): DeviceInfo => ({
  protocol: device.protocol,
  address: device.address,
  name: device.name,
  role: device.role,
  model: device.model,
  vendor: device.vendor,
  power: device.power,
  networkAddress: null,
})

export const infrastructure: DeviceInfo[] = [
  {
    protocol: 'zigbee',
    address: ZIGBEE_COORDINATOR,
    name: 'Koordinator',
    role: 'coordinator',
    model: 'SMLIGHT SLZB-06',
    vendor: 'SMLIGHT',
    power: 'mains',
    networkAddress: '0x0000',
  },
  {
    protocol: 'thread',
    address: THREAD_BORDER_ROUTER,
    name: 'Border Router',
    role: 'border_router',
    model: 'OpenThread Border Router',
    vendor: 'OpenThread',
    power: 'mains',
    networkAddress: null,
  },
]

export const demoDeviceInfos = (protocol: string) => [
  ...infrastructure.filter((d) => d.protocol === protocol),
  ...DEMO_DEVICES.filter((d) => d.protocol === protocol).map(toDeviceInfo),
]

/** A link's values from a score, in the protocol's own units */
const linkValues = (device: DemoDevice, score: number) => {
  const { lqi, rssi } = measurementAt(device, 0, score)
  return { lqi, rssi }
}

/** Both directions of a link given as scores: how `to` hears the device, and how it hears `to` */
const linkBothWays = (
  device: DemoDevice,
  to: string,
  there: number,
  back: number,
  parent: boolean,
) => [
  { from: device.address, to, ...linkValues(device, there), parent },
  { from: to, to: device.address, ...linkValues(device, back), parent: false },
]

/** The parent of each device at `hoursAgo`, plus a few neighbor links, as a topology */
export const linksAt = (protocol: string, hoursAgo: number, now: number): Link[] => {
  const devices = DEMO_DEVICES.filter((d) => d.protocol === protocol)
  return devices.flatMap((device, i) => {
    const parent = [...device.parents]
      .sort((a, b) => b[0] - a[0])
      .filter(([since]) => since >= hoursAgo)
      .at(-1)?.[1]
    if (!parent) return []
    const score = scoreAt(device, now - hoursAgo * HOUR, now, random(i + 1))
    const own = measurementAt(device, now, score)
    const neighbors = device.parents
      .map(([, address]) => address)
      .filter((address) => address !== parent)
      .map((address, n) => ({
        from: device.address,
        to: address,
        lqi: Math.max(5, Math.round((own.lqi ?? 0) * (protocol === 'zigbee' ? 0.4 / (n + 1) : 1))),
        rssi: own.rssi === null ? null : own.rssi - 8,
        parent: false,
      }))
    const uplink = device.uplink
      ? linkBothWays(device, parent, device.uplink[0], device.uplink[1], true)
      : [{ from: device.address, to: parent, lqi: own.lqi, rssi: own.rssi, parent: true }]
    const links = (device.links ?? []).flatMap((l) =>
      linkBothWays(device, l.to, l.there, l.back, false),
    )
    return [...uplink, ...neighbors, ...links]
  })
}

/** The mockup's energy scan: Wi-Fi on 1, 6 and 11 leaves 15, 20, 25 and 26 quiet */
const NOISE: Record<number, number> = {
  11: -64,
  12: -62,
  13: -63,
  14: -67,
  15: -86,
  16: -61,
  17: -59,
  18: -62,
  19: -66,
  20: -89,
  21: -72,
  22: -70,
  23: -71,
  24: -75,
  25: -91,
  26: -93,
}

export const DEMO_CHANNELS: Record<string, number> = { zigbee: 15, thread: 25 }

/** An energy scan with a little variation from scan to scan */
export const channelScanAt = (seed: number) => {
  const rnd = random(seed)
  return Object.entries(NOISE).map(([channel, energy]) => ({
    channel: Number(channel),
    energy: Math.round(energy + (rnd() - 0.5) * 4),
  }))
}
