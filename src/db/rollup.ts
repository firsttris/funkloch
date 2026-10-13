import { and, asc, eq, gte, inArray, lt, lte, sql } from 'drizzle-orm'
import { INTERVAL_WINDOW, offlineMinutes, typicalInterval } from '~/core/reachability'
import { completeHours, hourStart, rollupHour } from '~/core/rollup'
import { HOUR } from '~/core/types'
import type { Db } from './client'
import { devices, events, hourly, samples } from './schema'
import { getSetting, setSetting } from './store'

const LAST_ROLLUP = 'rollup:last_hour'

type Change = { deviceId: number; ts: number; online: boolean }

const availabilityChanges = (db: Db, from: number, to: number): Change[] =>
  db
    .select({ deviceId: events.deviceId, ts: events.ts, type: events.type })
    .from(events)
    .where(and(eq(events.kind, 'offline'), gte(events.ts, from), lt(events.ts, to)))
    .orderBy(asc(events.ts))
    .all()
    .flatMap((e) =>
      e.deviceId === null ? [] : [{ deviceId: e.deviceId, ts: e.ts, online: e.type === 'online' }],
    )

/** Whether each device was online at `ts`, from its last offline/online event before it. */
const onlineAt = (db: Db, ts: number): Map<number, boolean> => {
  const rows = db.all<{ device_id: number; type: string }>(sql`
    select e.device_id, e.type from events e
    join (select device_id, max(ts) ts from events where kind = 'offline' and ts < ${ts} group by device_id) last
      on last.device_id = e.device_id and last.ts = e.ts
    where e.kind = 'offline'`)
  return new Map(rows.map((r) => [r.device_id, r.type === 'online']))
}

/** Rolls up one complete hour for every device that had samples or was offline in it. */
export const rollupOneHour = (db: Db, hour: number) => {
  const end = hour + HOUR
  const rows = db
    .select({ deviceId: samples.deviceId, ts: samples.ts, score: samples.score, raw: samples.raw })
    .from(samples)
    .where(and(gte(samples.ts, hour), lt(samples.ts, end)))
    .all()
  const byDevice = Map.groupBy(rows, (r) => r.deviceId)
  const changes = Map.groupBy(availabilityChanges(db, hour, end), (c) => c.deviceId)
  const startState = onlineAt(db, hour)
  const offlineAtStart = [...startState].filter(([, online]) => !online).map(([id]) => id)
  const deviceIds = new Set([...byDevice.keys(), ...changes.keys(), ...offlineAtStart])

  db.transaction((tx) => {
    for (const deviceId of deviceIds) {
      const rollup = rollupHour(hour, byDevice.get(deviceId) ?? [])
      const offline = offlineMinutes(
        changes.get(deviceId) ?? [],
        startState.get(deviceId) ?? true,
        hour,
        end,
      )
      const values = {
        median: rollup?.median ?? null,
        min: rollup?.min ?? null,
        max: rollup?.max ?? null,
        rawMedian: rollup?.rawMedian ?? null,
        rawMin: rollup?.rawMin ?? null,
        rawMax: rollup?.rawMax ?? null,
        count: rollup?.count ?? 0,
        offlineMinutes: offline,
      }
      tx.insert(hourly)
        .values({ deviceId, hour, ...values })
        .onConflictDoUpdate({ target: [hourly.deviceId, hourly.hour], set: values })
        .run()
    }
  })
}

/** The usual message interval of every device, from its samples of the last 7 days. */
export const refreshIntervals = (db: Db, now: number) => {
  const rows = db
    .select({ deviceId: samples.deviceId, ts: samples.ts })
    .from(samples)
    .where(gte(samples.ts, now - INTERVAL_WINDOW))
    .all()
  const byDevice = Map.groupBy(rows, (r) => r.deviceId)
  db.transaction((tx) => {
    for (const [deviceId, list] of byDevice) {
      tx.update(devices)
        .set({ typicalInterval: typicalInterval(list.map((r) => r.ts)) })
        .where(eq(devices.id, deviceId))
        .run()
    }
  })
}

/**
 * Rolls up every complete hour since the last run, at most as far back as raw samples are kept,
 * then refreshes the message intervals. Safe to run any time; it catches up after a restart.
 */
export const rollupPending = (db: Db, now: number, maxBack = 14 * 24 * HOUR) => {
  const last = getSetting<number>(db, LAST_ROLLUP)
  const firstSample = db
    .select({ ts: sql<number | null>`min(${samples.ts})` })
    .from(samples)
    .get()?.ts
  const from = Math.max(
    last === undefined ? (firstSample ?? now) : last + HOUR,
    hourStart(now) - maxBack,
  )
  const hours = completeHours(from, now)
  for (const hour of hours) rollupOneHour(db, hour)
  const lastHour = hours.at(-1)
  if (lastHour !== undefined) setSetting(db, LAST_ROLLUP, lastHour)
  refreshIntervals(db, now)
  return hours.length
}

/** Hourly rows of some devices in [from, to], oldest first. */
export const hourlyRows = (db: Db, deviceIds: number[], from: number, to: number) =>
  db
    .select()
    .from(hourly)
    .where(and(inArray(hourly.deviceId, deviceIds), gte(hourly.hour, from), lte(hourly.hour, to)))
    .orderBy(asc(hourly.hour))
    .all()
