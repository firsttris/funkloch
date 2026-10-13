import { median } from './stats'
import { DAY, HOUR } from './types'

/** Times in [from, to] during which a device was offline, from its offline and online changes. */
export const offlineIntervals = (
  changes: readonly { ts: number; online: boolean }[],
  onlineAtStart: boolean,
  from: number,
  to: number,
): [number, number][] => {
  const intervals: [number, number][] = []
  let offlineSince = onlineAtStart ? null : from
  for (const change of [...changes].sort((a, b) => a.ts - b.ts)) {
    if (change.ts < from || change.ts > to) continue
    if (!change.online && offlineSince === null) offlineSince = change.ts
    if (change.online && offlineSince !== null) {
      intervals.push([offlineSince, change.ts])
      offlineSince = null
    }
  }
  if (offlineSince !== null) intervals.push([offlineSince, to])
  return intervals
}

/** How often the parent changed over a series of snapshots (null: no parent known then). */
export const parentChanges = (parents: readonly (string | null)[]) => {
  const known = parents.filter((p): p is string => p !== null)
  return known.slice(1).filter((p, i) => p !== known[i]).length
}

export type ConnectionKind = 'parent' | 'child' | 'neighbor'

const KIND_ORDER: ConnectionKind[] = ['parent', 'child', 'neighbor']

/**
 * The devices a device is linked to in one snapshot, one entry each: a parent or child link wins
 * over a neighbor link of the same pair (a router's uplink keeps both directions). Parent first,
 * then children and neighbors, each by link quality.
 */
export const connections = <T extends { otherId: number; fromId: number; parent: boolean }>(
  deviceId: number,
  links: readonly T[],
  quality: (link: T) => number | null,
) => {
  const kindOf = (link: T): ConnectionKind =>
    !link.parent ? 'neighbor' : link.fromId === deviceId ? 'parent' : 'child'
  const byOther = new Map<number, T & { kind: ConnectionKind }>()
  for (const link of links) {
    const entry = { ...link, kind: kindOf(link) }
    const existing = byOther.get(link.otherId)
    if (!existing || (existing.kind === 'neighbor' && entry.kind !== 'neighbor'))
      byOther.set(link.otherId, entry)
  }
  return [...byOther.values()].sort(
    (a, b) =>
      KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) ||
      (quality(b) ?? -1) - (quality(a) ?? -1),
  )
}

/**
 * Since when a device has had `parent`: the oldest snapshot of the unbroken run up to the newest.
 * Null when the newest snapshot shows another parent or none.
 */
export const parentSince = (
  history: readonly { ts: number; parent: string | null }[],
  parent: string,
) => {
  let since: number | null = null
  for (const entry of [...history].sort((a, b) => b.ts - a.ts)) {
    if (entry.parent !== parent) break
    since = entry.ts
  }
  return since
}

export type DetailKpis = {
  /** Median of the hourly raw medians over 7 days */
  rawMedian7d: number | null
  /** Change of the daily score median, first day of the 7 against the last, in percent */
  changePercent: number | null
  messagesPerHour: number
}

export const detailKpis = (
  hourly: readonly { hour: number; median: number | null; rawMedian: number | null }[],
  samplesLast48h: number,
  now: number,
): DetailKpis => {
  const week = hourly.filter((h) => h.hour >= now - 7 * DAY)
  const values = (rows: typeof week, key: 'median' | 'rawMedian') =>
    rows.flatMap((h) => (h[key] === null ? [] : [h[key]]))
  const firstDay = median(
    values(
      week.filter((h) => h.hour < now - 6 * DAY),
      'median',
    ),
  )
  const lastDay = median(
    values(
      week.filter((h) => h.hour >= now - DAY),
      'median',
    ),
  )
  return {
    rawMedian7d: median(values(week, 'rawMedian')),
    changePercent:
      firstDay === null || lastDay === null || firstDay === 0
        ? null
        : Math.round(((lastDay - firstDay) / firstDay) * 100),
    messagesPerHour: Math.round((samplesLast48h / 48) * 10) / 10,
  }
}

export const RANGES = { '24h': DAY, '7d': 7 * DAY, '30d': 30 * DAY } as const
export type Range = keyof typeof RANGES

/** Charts up to 48 h read raw samples, longer ranges the hourly rollups */
export const usesRawSamples = (range: Range) => RANGES[range] <= 48 * HOUR

export type ChartSeries = {
  /** Seconds since the epoch, as uPlot wants them */
  x: number[]
  median: (number | null)[]
  min: (number | null)[]
  max: (number | null)[]
}

/** One point per hour from the rollups, null where an hour has no data so the line breaks. */
export const hourlyChart = (
  rows: readonly {
    hour: number
    rawMedian: number | null
    rawMin: number | null
    rawMax: number | null
  }[],
  from: number,
  now: number,
): ChartSeries => {
  const byHour = new Map(rows.map((r) => [r.hour, r]))
  const series: ChartSeries = { x: [], median: [], min: [], max: [] }
  for (let hour = Math.floor(from / HOUR) * HOUR; hour <= now; hour += HOUR) {
    const row = byHour.get(hour)
    series.x.push(hour / 1000)
    series.median.push(row?.rawMedian ?? null)
    series.min.push(row?.rawMin ?? null)
    series.max.push(row?.rawMax ?? null)
  }
  return series
}

/** Every raw sample; a gap of more than `maxGap` gets a null so the line does not bridge it. */
export const rawChart = (
  samples: readonly { ts: number; raw: number }[],
  maxGap = HOUR,
): ChartSeries => {
  const series: ChartSeries = { x: [], median: [], min: [], max: [] }
  samples.forEach((sample, i) => {
    const previous = samples[i - 1]
    if (previous && sample.ts - previous.ts > maxGap) {
      series.x.push((previous.ts + 1) / 1000)
      series.median.push(null)
      series.min.push(null)
      series.max.push(null)
    }
    series.x.push(sample.ts / 1000)
    series.median.push(sample.raw)
    series.min.push(null)
    series.max.push(null)
  })
  return series
}
