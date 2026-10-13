import { deviceStatus } from './devices'
import { hourlySeries } from './rollup'
import type { Thresholds } from './score'
import { median } from './stats'
import { trend } from './trend'
import { HOUR, type Role, type Status, type Trend } from './types'

export type OverviewDevice = {
  id: number
  protocol: string
  name: string
  model: string | null
  vendor: string | null
  role: Role
  online: boolean
  lastSeen: number | null
}

export type OverviewInput = {
  now: number
  /** Hours the sparkline covers */
  rangeHours: number
  devices: OverviewDevice[]
  /** Scores of the last 60 minutes per device */
  recentScores: Map<number, number[]>
  /** Hourly score medians per device, oldest first, the running hour included */
  hourly: Map<number, { hour: number; median: number }[]>
  /** Name of the device each device is connected through */
  via: Map<number, string>
  thresholds?: Thresholds
}

export type OverviewRow = OverviewDevice & {
  status: Status
  /** Median score of the last hour, else the last hourly median */
  score: number | null
  spark: (number | null)[]
  trend: Trend
  via: string | null
}

const STATUS_ORDER: Record<Status, number> = { offline: 0, weak: 1, mid: 2, good: 3, unknown: 4 }

/** Worst first: offline, then by score, devices without data last. */
export const compareRows = (a: OverviewRow, b: OverviewRow) =>
  STATUS_ORDER[a.status] - STATUS_ORDER[b.status] ||
  (a.score ?? 101) - (b.score ?? 101) ||
  a.name.localeCompare(b.name)

export const buildOverview = (input: OverviewInput) => {
  const { now, rangeHours } = input
  const rows = input.devices
    .map((device): OverviewRow => {
      const hourly = input.hourly.get(device.id) ?? []
      const score = median(input.recentScores.get(device.id) ?? []) ?? hourly.at(-1)?.median ?? null
      return {
        ...device,
        status: deviceStatus(device.online, score, input.thresholds),
        score: score === null ? null : Math.round(score),
        spark: hourlySeries(
          hourly.map((h) => ({ hour: h.hour, value: h.median })),
          now - (rangeHours - 1) * HOUR,
          now,
        ),
        trend: trend(hourly, now),
        via: input.via.get(device.id) ?? null,
      }
    })
    .sort(compareRows)
  const protocols = [...new Set(rows.map((r) => r.protocol))].sort()
  return {
    rows,
    counts: {
      total: rows.length,
      byProtocol: Object.fromEntries(
        protocols.map((p) => [p, rows.filter((r) => r.protocol === p).length]),
      ),
      offline: rows.filter((r) => r.status === 'offline').length,
      weak: rows.filter((r) => r.status === 'weak').length,
      down: rows.filter((r) => r.trend === 'down').length,
    },
  }
}
