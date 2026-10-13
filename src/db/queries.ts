// Reads for the pages. The shaping into rows and numbers is done by the pure functions in
// src/core; these only fetch.
import { and, asc, desc, eq, gte, inArray, isNull, lt, notInArray, or, sql } from 'drizzle-orm'
import { alias } from 'drizzle-orm/sqlite-core'
import { hourStart } from '~/core/rollup'
import { median } from '~/core/stats'
import type { Db } from './client'
import { INFRASTRUCTURE_ROLES } from './reachability'
import { devices, events, hourly, links, samples, snapshots } from './schema'

export const displayName = (d: { name: string; customName: string | null }) =>
  d.customName ?? d.name

/** Devices with a signal of their own, i.e. no coordinators or border routers */
export const listedDevices = (db: Db) =>
  db
    .select()
    .from(devices)
    .where(and(isNull(devices.removedAt), notInArray(devices.role, INFRASTRUCTURE_ROLES)))
    .all()

export const recentScores = (db: Db, since: number) => {
  const rows = db
    .select({ deviceId: samples.deviceId, score: samples.score })
    .from(samples)
    .where(gte(samples.ts, since))
    .all()
  const byDevice = new Map<number, number[]>()
  for (const row of rows)
    byDevice.set(row.deviceId, [...(byDevice.get(row.deviceId) ?? []), row.score])
  return byDevice
}

/** Hourly score medians since `since`, with the running hour computed from its samples. */
export const hourlyMedians = (db: Db, since: number, now: number) => {
  const rows = db
    .select({ deviceId: hourly.deviceId, hour: hourly.hour, median: hourly.median })
    .from(hourly)
    .where(and(gte(hourly.hour, hourStart(since)), sql`${hourly.median} is not null`))
    .orderBy(asc(hourly.hour))
    .all()
  const byDevice = new Map<number, { hour: number; median: number }[]>()
  for (const row of rows) {
    if (row.median === null) continue
    byDevice.set(row.deviceId, [
      ...(byDevice.get(row.deviceId) ?? []),
      { hour: row.hour, median: row.median },
    ])
  }
  const running = hourStart(now)
  for (const [deviceId, scores] of recentScores(db, running)) {
    const value = median(scores)
    if (value === null) continue
    const list = (byDevice.get(deviceId) ?? []).filter((h) => h.hour !== running)
    byDevice.set(deviceId, [...list, { hour: running, median: value }])
  }
  return byDevice
}

/** The newest topology snapshot of a protocol */
export const latestSnapshot = (db: Db, protocol: string) =>
  db
    .select()
    .from(snapshots)
    .where(eq(snapshots.protocol, protocol))
    .orderBy(desc(snapshots.ts))
    .limit(1)
    .get()

/** Device id → name of its parent, from the newest snapshot of every protocol */
export const parentNames = (db: Db) => {
  const parent = alias(devices, 'parent')
  const protocols = db.selectDistinct({ protocol: snapshots.protocol }).from(snapshots).all()
  const ids = protocols.flatMap((p) => {
    const snapshot = latestSnapshot(db, p.protocol)
    return snapshot ? [snapshot.id] : []
  })
  if (ids.length === 0) return new Map<number, string>()
  const rows = db
    .select({ fromId: links.fromId, name: parent.name, customName: parent.customName })
    .from(links)
    .innerJoin(parent, eq(parent.id, links.toId))
    .where(and(inArray(links.snapshotId, ids), eq(links.parent, true)))
    .all()
  return new Map(rows.map((r) => [r.fromId, displayName(r)]))
}

export const latestSamples = (db: Db) =>
  new Map(
    db
      .all<{
        device_id: number
        raw: number
        lqi: number | null
        rssi: number | null
        ts: number
      }>(sql`
        select s.device_id, s.raw, s.lqi, s.rssi, s.ts from samples s
        join (select device_id, max(ts) ts from samples group by device_id) m
          on m.device_id = s.device_id and m.ts = s.ts`)
      .map((r) => [r.device_id, r]),
  )

export const deviceById = (db: Db, id: number) =>
  db.select().from(devices).where(eq(devices.id, id)).get()

export const rawSamples = (db: Db, deviceId: number, from: number) =>
  db
    .select({ ts: samples.ts, raw: samples.raw, score: samples.score })
    .from(samples)
    .where(and(eq(samples.deviceId, deviceId), gte(samples.ts, from)))
    .orderBy(asc(samples.ts))
    .all()

export const hourlyOf = (db: Db, deviceId: number, from: number) =>
  db
    .select()
    .from(hourly)
    .where(and(eq(hourly.deviceId, deviceId), gte(hourly.hour, hourStart(from))))
    .orderBy(asc(hourly.hour))
    .all()

/** Offline and online changes of a device in [from, to] and its state at `from` */
export const availabilityOf = (db: Db, deviceId: number, from: number, to: number) => {
  const offline = and(eq(events.deviceId, deviceId), eq(events.kind, 'offline'))
  const before = db
    .select({ type: events.type })
    .from(events)
    .where(and(offline, lt(events.ts, from)))
    .orderBy(desc(events.ts))
    .limit(1)
    .get()
  const changes = db
    .select({ ts: events.ts, type: events.type })
    .from(events)
    .where(and(offline, gte(events.ts, from), lt(events.ts, to)))
    .orderBy(asc(events.ts))
    .all()
    .map((e) => ({ ts: e.ts, online: e.type === 'online' }))
  return { onlineAtStart: before?.type !== 'offline', changes }
}

/** The parent of a device in each snapshot since `from`, oldest first */
export const parentHistory = (db: Db, deviceId: number, protocol: string, from: number) =>
  db
    .all<{ to_id: number | null }>(sql`
      select l.to_id from snapshots s
      left join links l on l.snapshot_id = s.id and l.from_id = ${deviceId} and l.parent = 1
      where s.protocol = ${protocol} and s.ts >= ${from}
      order by s.ts`)
    .map((r) => (r.to_id === null ? null : String(r.to_id)))

export const linksOf = (db: Db, deviceId: number, snapshotId: number) => {
  const other = alias(devices, 'other')
  return db
    .select({
      fromId: links.fromId,
      toId: links.toId,
      lqi: links.lqi,
      rssi: links.rssi,
      parent: links.parent,
      otherId: other.id,
      name: other.name,
      customName: other.customName,
      role: other.role,
    })
    .from(links)
    .innerJoin(
      other,
      or(
        and(eq(links.fromId, deviceId), eq(other.id, links.toId)),
        and(eq(links.toId, deviceId), eq(other.id, links.fromId)),
      ),
    )
    .where(
      and(
        eq(links.snapshotId, snapshotId),
        or(eq(links.fromId, deviceId), eq(links.toId, deviceId)),
      ),
    )
    .all()
}

export const eventsOf = (db: Db, deviceId: number, limit = 20) =>
  db
    .select()
    .from(events)
    .where(eq(events.deviceId, deviceId))
    .orderBy(desc(events.ts), desc(events.id))
    .limit(limit)
    .all()

export const samplesSince = (db: Db, deviceId: number, from: number) =>
  db
    .select({ count: sql<number>`count(*)` })
    .from(samples)
    .where(and(eq(samples.deviceId, deviceId), gte(samples.ts, from)))
    .get()?.count ?? 0

/** Messages per hour from `from` on: the rollups, plus the running hour from its samples */
export const messagesPerHour = (db: Db, deviceId: number, from: number, now: number) => {
  const rows = hourlyOf(db, deviceId, from).map((h) => ({ hour: h.hour, value: h.count }))
  const running = hourStart(now)
  return [
    ...rows.filter((r) => r.hour !== running),
    { hour: running, value: samplesSince(db, deviceId, running) },
  ]
}

/** Snapshots of a protocol since `from`, oldest first */
export const snapshotsOf = (db: Db, protocol: string, from: number) =>
  db
    .select()
    .from(snapshots)
    .where(and(eq(snapshots.protocol, protocol), gte(snapshots.ts, from)))
    .orderBy(asc(snapshots.ts))
    .all()

export const linksOfSnapshot = (db: Db, snapshotId: number) =>
  db.select().from(links).where(eq(links.snapshotId, snapshotId)).all()

/** Every device of a protocol that is not removed, coordinators included */
export const devicesOfProtocol = (db: Db, protocol: string) =>
  db
    .select()
    .from(devices)
    .where(and(eq(devices.protocol, protocol), isNull(devices.removedAt)))
    .all()

/** Events since `from`, newest first, with the device's name and address */
export const eventsSince = (db: Db, from: number, kind: string | null, limit = 1000) =>
  db
    .select({
      id: events.id,
      ts: events.ts,
      kind: events.kind,
      type: events.type,
      protocol: events.protocol,
      details: events.details,
      deviceId: events.deviceId,
      name: devices.name,
      customName: devices.customName,
      address: devices.address,
    })
    .from(events)
    .leftJoin(devices, eq(devices.id, events.deviceId))
    .where(and(gte(events.ts, from), kind ? eq(events.kind, kind) : undefined))
    .orderBy(desc(events.ts), desc(events.id))
    .limit(limit)
    .all()

export const eventCounts = (db: Db, from: number) =>
  Object.fromEntries(
    db
      .select({ kind: events.kind, count: sql<number>`count(*)` })
      .from(events)
      .where(gte(events.ts, from))
      .groupBy(events.kind)
      .all()
      .map((r) => [r.kind, r.count]),
  )

/** Hourly cells of every device since `from` */
export const hourlyCells = (db: Db, from: number) =>
  db
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

/** Events of one type since `from`, newest first */
export const eventsOfType = (db: Db, type: string, from: number) =>
  db
    .select()
    .from(events)
    .where(and(eq(events.type, type), gte(events.ts, from)))
    .orderBy(desc(events.ts))
    .all()
