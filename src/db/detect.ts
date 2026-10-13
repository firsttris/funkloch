// Detectors that turn state changes into events; each one is idempotent, so running it again
// with the same data makes no second event.
import { and, eq, gte, isNull, lt, notInArray } from 'drizzle-orm'
import { signalTransition, trendTransition } from '~/core/events'
import { findPattern, PATTERN_DAYS } from '~/core/patterns'
import type { Thresholds } from '~/core/score'
import { trend } from '~/core/trend'
import { DAY, MINUTE, type Trend } from '~/core/types'
import type { Db } from './client'
import { INFRASTRUCTURE_ROLES } from './reachability'
import { devices, events, hourly, samples } from './schema'
import { addEvent } from './store'

const listed = (db: Db) =>
  db
    .select()
    .from(devices)
    .where(and(isNull(devices.removedAt), notInArray(devices.role, INFRASTRUCTURE_ROLES)))
    .all()

/** How a protocol writes a value and the weak threshold, e.g. "LQI 38" and "LQI 64" */
export type SignalFormat = {
  value: (
    protocol: string,
    sample: { raw: number; lqi: number | null; rssi: number | null },
  ) => string
  threshold: (protocol: string, weakScore: number) => string
}

const plainFormat: SignalFormat = {
  value: (_protocol, sample) => String(sample.raw),
  threshold: (_protocol, weak) => `${weak} %`,
}

/** Signal under or back over the weak threshold, from the median of the last `minutes` */
export const detectSignal = (
  db: Db,
  now: number,
  thresholds: Thresholds,
  minutes: number,
  format: SignalFormat = plainFormat,
) => {
  const rows = db
    .select({
      deviceId: samples.deviceId,
      score: samples.score,
      raw: samples.raw,
      lqi: samples.lqi,
      rssi: samples.rssi,
    })
    .from(samples)
    .where(gte(samples.ts, now - minutes * MINUTE))
    .all()
  const byDevice = Map.groupBy(rows, (r) => r.deviceId)
  let changed = 0
  db.transaction((tx) => {
    for (const device of listed(db)) {
      if (!device.online) continue
      const window = byDevice.get(device.id) ?? []
      const transition = signalTransition(
        device.signalWeak,
        window.map((r) => r.score),
        thresholds,
      )
      if (!transition) continue
      changed++
      const weak = transition === 'signal_weak'
      tx.update(devices).set({ signalWeak: weak }).where(eq(devices.id, device.id)).run()
      const middle = [...window].sort((a, b) => a.score - b.score)[Math.floor(window.length / 2)]
      addEvent(tx, {
        ts: now,
        kind: 'signal',
        type: transition,
        protocol: device.protocol,
        deviceId: device.id,
        details: {
          value: middle ? format.value(device.protocol, middle) : null,
          threshold: format.threshold(device.protocol, thresholds.weak),
          minutes,
        },
      })
    }
  })
  return changed
}

/** A falling 72 h trend, from the hourly medians; run after each rollup */
export const detectTrends = (db: Db, now: number) => {
  const rows = db
    .select({ deviceId: hourly.deviceId, hour: hourly.hour, median: hourly.median })
    .from(hourly)
    .where(and(gte(hourly.hour, now - 3 * DAY - 3_600_000), lt(hourly.hour, now)))
    .all()
  const byDevice = Map.groupBy(
    rows.flatMap((r) => (r.median === null ? [] : [{ ...r, median: r.median }])),
    (r) => r.deviceId,
  )
  let changed = 0
  db.transaction((tx) => {
    for (const device of listed(db)) {
      const medians = byDevice.get(device.id) ?? []
      const next = trend(medians, now)
      if (next === device.trend) continue
      tx.update(devices).set({ trend: next }).where(eq(devices.id, device.id)).run()
      if (trendTransition(device.trend as Trend | null, next) === null) continue
      changed++
      const first = medians[0]?.median ?? null
      const last = medians.at(-1)?.median ?? null
      addEvent(tx, {
        ts: now,
        kind: 'signal',
        type: 'trend_down',
        protocol: device.protocol,
        deviceId: device.id,
        details: {
          change: first !== null && last !== null ? Math.round(last - first) : null,
        },
      })
    }
  })
  return changed
}

/**
 * Recurring weak hours (e.g. every evening): run once a day; a pattern already reported for the
 * device in the last week is not reported again.
 */
export const detectPatterns = (
  db: Db,
  now: number,
  thresholds: Thresholds,
  hourOfDay: (ts: number) => number = (ts) => new Date(ts).getHours(),
) => {
  const from = now - PATTERN_DAYS * DAY
  const rows = db
    .select({
      deviceId: hourly.deviceId,
      hour: hourly.hour,
      median: hourly.median,
      offlineMinutes: hourly.offlineMinutes,
      count: hourly.count,
    })
    .from(hourly)
    .where(gte(hourly.hour, from))
    .all()
  const byDevice = Map.groupBy(rows, (r) => r.deviceId)
  const reported = new Set(
    db
      .select({ deviceId: events.deviceId, details: events.details })
      .from(events)
      .where(and(eq(events.type, 'pattern'), gte(events.ts, from)))
      .all()
      .map((e) => `${e.deviceId}:${e.details?.from}-${e.details?.to}`),
  )
  let found = 0
  for (const device of listed(db)) {
    const pattern = findPattern(byDevice.get(device.id) ?? [], now, thresholds, hourOfDay)
    if (!pattern || reported.has(`${device.id}:${pattern.from}-${pattern.to}`)) continue
    found++
    addEvent(db, {
      ts: now,
      kind: 'signal',
      type: 'pattern',
      protocol: device.protocol,
      deviceId: device.id,
      details: { ...pattern },
    })
  }
  return found
}
