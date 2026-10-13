// Writes observations into the database. Each function is one step; the ingest in
// src/server/ingest.ts decides when to call which.
import { and, eq, inArray, isNull, sql } from 'drizzle-orm'
import { diffDevices } from '~/core/devices'
import type { DeviceInfo, Measurement, PowerSource, Role, Topology } from '~/core/types'
import type { Db } from './client'
import { devices, events, links, samples, settings, snapshots } from './schema'

type Tx = Parameters<Parameters<Db['transaction']>[0]>[0]
type Conn = Db | Tx

export type EventInput = {
  ts: number
  kind: 'offline' | 'signal' | 'topology' | 'network'
  type: string
  protocol: string | null
  deviceId: number | null
  details?: Record<string, unknown>
}

export const addEvent = (db: Conn, event: EventInput) =>
  db
    .insert(events)
    .values({ ...event, details: event.details ?? {} })
    .run()

const toInfo = (row: typeof devices.$inferSelect): DeviceInfo => ({
  protocol: row.protocol,
  address: row.address,
  name: row.name,
  role: row.role as Role,
  model: row.model,
  vendor: row.vendor,
  power: row.power as PowerSource,
  networkAddress: row.networkAddress,
})

const infoColumns = (d: DeviceInfo) => ({
  name: d.name,
  role: d.role,
  model: d.model,
  vendor: d.vendor,
  power: d.power,
  networkAddress: d.networkAddress,
})

/**
 * Applies a full device list of one protocol: new devices are inserted (or come back from
 * removed), changed ones updated, missing ones marked removed. The very first list of a protocol
 * makes no "new device" events, otherwise the first start would report every device as new.
 */
export const applyDevices = (db: Db, protocol: string, incoming: DeviceInfo[], ts: number) =>
  db.transaction((tx) => {
    const known = tx
      .select()
      .from(devices)
      .where(and(eq(devices.protocol, protocol), isNull(devices.removedAt)))
      .all()
    const firstList = known.length === 0
    const { added, changed, removed } = diffDevices(known.map(toInfo), incoming)

    for (const device of added) {
      const row = tx
        .insert(devices)
        .values({ protocol, address: device.address, firstSeen: ts, ...infoColumns(device) })
        .onConflictDoUpdate({
          target: [devices.protocol, devices.address],
          set: { ...infoColumns(device), removedAt: null },
        })
        .returning({ id: devices.id })
        .get()
      if (!firstList) {
        addEvent(tx, {
          ts,
          kind: 'network',
          type: 'device_added',
          protocol,
          deviceId: row.id,
          details: { role: device.role },
        })
      }
    }
    for (const device of changed) {
      tx.update(devices)
        .set(infoColumns(device))
        .where(and(eq(devices.protocol, protocol), eq(devices.address, device.address)))
        .run()
    }
    if (removed.length > 0) {
      const gone = tx
        .update(devices)
        .set({ removedAt: ts })
        .where(and(eq(devices.protocol, protocol), inArray(devices.address, removed)))
        .returning({ id: devices.id })
        .all()
      for (const { id } of gone) {
        addEvent(tx, { ts, kind: 'network', type: 'device_removed', protocol, deviceId: id })
      }
    }
  })

/** The id of a device, inserting a bare one (named by its address) if it is not known yet. */
export const ensureDevice = (db: Conn, protocol: string, address: string, ts: number) => {
  const existing = db
    .select({ id: devices.id })
    .from(devices)
    .where(and(eq(devices.protocol, protocol), eq(devices.address, address)))
    .get()
  if (existing) return existing.id
  return db
    .insert(devices)
    .values({ protocol, address, name: address, firstSeen: ts })
    .returning({ id: devices.id })
    .get().id
}

export type SeenInput = { protocol: string; address: string; ts: number; battery: number | null }

/** Stores a batch of measurements and signs of life in one transaction. */
export const storeBatch = (db: Db, measurements: Measurement[], seen: SeenInput[]) =>
  db.transaction((tx) => {
    for (const m of measurements) {
      const deviceId = ensureDevice(tx, m.protocol, m.address, m.ts)
      tx.insert(samples)
        .values({
          deviceId,
          ts: m.ts,
          score: m.score,
          raw: m.raw,
          lqi: m.lqi,
          rssi: m.rssi,
          source: m.source,
        })
        .onConflictDoNothing()
        .run()
    }
    for (const s of [...measurements, ...seen]) {
      tx.update(devices)
        .set({
          lastSeen: sql`max(coalesce(${devices.lastSeen}, 0), ${s.ts})`,
          ...(s.battery === null ? {} : { battery: s.battery }),
        })
        .where(and(eq(devices.protocol, s.protocol), eq(devices.address, s.address)))
        .run()
    }
  })

/** Remembers what the protocol reports; the effective state follows in the reachability check. */
export const storeReportedAvailability = (
  db: Db,
  protocol: string,
  address: string,
  online: boolean,
  ts: number,
) => {
  const deviceId = ensureDevice(db, protocol, address, ts)
  db.update(devices).set({ reportedOnline: online }).where(eq(devices.id, deviceId)).run()
  return deviceId
}

/** Stores a topology snapshot; links to devices Funkloch does not know are left out. */
export const storeTopology = (db: Db, topology: Topology) =>
  db.transaction((tx) => {
    const ids = new Map(
      tx
        .select({ id: devices.id, address: devices.address })
        .from(devices)
        .where(eq(devices.protocol, topology.protocol))
        .all()
        .map((d) => [d.address, d.id]),
    )
    const snapshot = tx
      .insert(snapshots)
      .values({ protocol: topology.protocol, ts: topology.ts })
      .returning({ id: snapshots.id })
      .get()
    for (const link of topology.links) {
      const fromId = ids.get(link.from)
      const toId = ids.get(link.to)
      if (fromId === undefined || toId === undefined) continue
      tx.insert(links)
        .values({
          snapshotId: snapshot.id,
          fromId,
          toId,
          lqi: link.lqi,
          rssi: link.rssi,
          parent: link.parent,
        })
        .onConflictDoNothing()
        .run()
    }
    return snapshot.id
  })

export const getSetting = <T>(db: Conn, key: string): T | undefined =>
  db.select({ value: settings.value }).from(settings).where(eq(settings.key, key)).get()?.value as
    | T
    | undefined

export const setSetting = (db: Conn, key: string, value: unknown) =>
  db
    .insert(settings)
    .values({ key, value, updatedAt: Date.now() })
    .onConflictDoUpdate({ target: settings.key, set: { value, updatedAt: Date.now() } })
    .run()

/** Records the bridge state of a protocol and makes an event when it changes. */
export const storeBridgeState = (db: Db, protocol: string, online: boolean, ts: number) => {
  const key = `bridge:${protocol}`
  const before = getSetting<boolean>(db, key)
  if (before === online) return
  setSetting(db, key, online)
  if (before === undefined) return
  addEvent(db, {
    ts,
    kind: 'network',
    type: online ? 'bridge_online' : 'bridge_offline',
    protocol,
    deviceId: null,
  })
}
