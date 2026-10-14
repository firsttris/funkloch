import { sql } from 'drizzle-orm'
import {
  index,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core'

// All timestamps are milliseconds since the epoch.

export type EventDetails = Record<string, string | number | boolean | null>

export const devices = sqliteTable(
  'devices',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    protocol: text('protocol').notNull(),
    address: text('address').notNull(),
    name: text('name').notNull(),
    customName: text('custom_name'),
    role: text('role').notNull().default('unknown'),
    model: text('model'),
    vendor: text('vendor'),
    power: text('power').notNull().default('unknown'),
    networkAddress: text('network_address'),
    battery: real('battery'),
    /** What the protocol last reported: 1 online, 0 offline, null not reported */
    reportedOnline: integer('reported_online', { mode: 'boolean' }),
    /** Effective state after the silence rule, kept so changes become events */
    online: integer('online', { mode: 'boolean' }).notNull().default(true),
    /** The signal is below the weak threshold (the last signal event said so) */
    signalWeak: integer('signal_weak', { mode: 'boolean' }).notNull().default(false),
    /** The transmit error rate is above the warning rate (the last event said so) */
    txErrorsHigh: integer('tx_errors_high', { mode: 'boolean' }).notNull().default(false),
    /** Trend at the last hourly check: down, flat, up or none */
    trend: text('trend'),
    /** Median gap between messages over 7 days, refreshed by the hourly job */
    typicalInterval: integer('typical_interval'),
    firstSeen: integer('first_seen').notNull(),
    lastSeen: integer('last_seen'),
    removedAt: integer('removed_at'),
  },
  (t) => [uniqueIndex('devices_protocol_address').on(t.protocol, t.address)],
)

export const samples = sqliteTable(
  'samples',
  {
    deviceId: integer('device_id')
      .notNull()
      .references(() => devices.id, { onDelete: 'cascade' }),
    ts: integer('ts').notNull(),
    score: real('score').notNull(),
    raw: real('raw').notNull(),
    lqi: real('lqi'),
    rssi: real('rssi'),
    source: text('source').notNull(),
  },
  (t) => [primaryKey({ columns: [t.deviceId, t.ts] }), index('samples_ts').on(t.ts)],
)

/** Cumulative transmit counters of a device's radio, one row per reading (Thread MAC counters) */
export const counters = sqliteTable(
  'counters',
  {
    deviceId: integer('device_id')
      .notNull()
      .references(() => devices.id, { onDelete: 'cascade' }),
    ts: integer('ts').notNull(),
    unicast: integer('unicast').notNull(),
    broadcast: integer('broadcast').notNull(),
    errors: integer('errors').notNull(),
  },
  (t) => [primaryKey({ columns: [t.deviceId, t.ts] }), index('counters_ts').on(t.ts)],
)

export const hourly = sqliteTable(
  'hourly',
  {
    deviceId: integer('device_id')
      .notNull()
      .references(() => devices.id, { onDelete: 'cascade' }),
    hour: integer('hour').notNull(),
    median: real('median'),
    min: real('min'),
    max: real('max'),
    rawMedian: real('raw_median'),
    rawMin: real('raw_min'),
    rawMax: real('raw_max'),
    count: integer('count').notNull().default(0),
    offlineMinutes: integer('offline_minutes').notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.deviceId, t.hour] }), index('hourly_hour').on(t.hour)],
)

export const snapshots = sqliteTable(
  'snapshots',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    protocol: text('protocol').notNull(),
    ts: integer('ts').notNull(),
  },
  (t) => [index('snapshots_protocol_ts').on(t.protocol, t.ts)],
)

export const links = sqliteTable(
  'links',
  {
    snapshotId: integer('snapshot_id')
      .notNull()
      .references(() => snapshots.id, { onDelete: 'cascade' }),
    fromId: integer('from_id')
      .notNull()
      .references(() => devices.id, { onDelete: 'cascade' }),
    toId: integer('to_id')
      .notNull()
      .references(() => devices.id, { onDelete: 'cascade' }),
    lqi: real('lqi'),
    rssi: real('rssi'),
    parent: integer('parent', { mode: 'boolean' }).notNull().default(false),
  },
  (t) => [primaryKey({ columns: [t.snapshotId, t.fromId, t.toId] })],
)

export const channelScans = sqliteTable(
  'channel_scans',
  {
    ts: integer('ts').notNull(),
    channel: integer('channel').notNull(),
    /** Energy in dBm */
    energy: real('energy').notNull(),
  },
  (t) => [primaryKey({ columns: [t.ts, t.channel] })],
)

export const events = sqliteTable(
  'events',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    ts: integer('ts').notNull(),
    /** offline | signal | topology | network */
    kind: text('kind').notNull(),
    /** e.g. offline, online, device_added, device_removed, bridge_offline */
    type: text('type').notNull(),
    protocol: text('protocol'),
    deviceId: integer('device_id').references(() => devices.id, { onDelete: 'cascade' }),
    /** Values for the localized text, as JSON */
    details: text('details', { mode: 'json' }).$type<EventDetails>(),
    /** Notification state: null pending, sent, skipped (rule off, too old, duplicate) or failed */
    delivery: text('delivery'),
  },
  (t) => [index('events_ts').on(t.ts), index('events_device_ts').on(t.deviceId, t.ts)],
)

export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value', { mode: 'json' }).notNull(),
  updatedAt: integer('updated_at').notNull().default(sql`(unixepoch() * 1000)`),
})

/** Admin sessions; only the SHA-256 of the token is stored */
export const sessions = sqliteTable(
  'sessions',
  {
    tokenHash: text('token_hash').primaryKey(),
    createdAt: integer('created_at').notNull(),
    expiresAt: integer('expires_at').notNull(),
  },
  (t) => [index('sessions_expires').on(t.expiresAt)],
)
