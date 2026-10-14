import { and, asc, desc, eq, gte, inArray, isNull } from 'drizzle-orm'
import { DEDUPE_WINDOW, type Decision, decide, dedupeKey, hasChannel } from '~/core/notify'
import type { Settings } from '~/core/settings'
import type { Db } from '~/db/client'
import { devices, events } from '~/db/schema'
import type { Log } from '../log'
import { type MqttPublisher, sendAll } from './channels'
import { notification } from './message'

const latestDeliveryPerDevice = (db: Db, type: string) => {
  const rows = db
    .select({ deviceId: events.deviceId, delivery: events.delivery })
    .from(events)
    .where(eq(events.type, type))
    .orderBy(asc(events.ts), asc(events.id))
    .all()
  const latest = new Map<number, string | null>()
  for (const row of rows) if (row.deviceId !== null) latest.set(row.deviceId, row.delivery)
  return new Set([...latest].filter(([, delivery]) => delivery === 'sent').map(([id]) => id))
}

const history = (db: Db, now: number) => {
  const sent = db
    .select({ type: events.type, deviceId: events.deviceId, ts: events.ts })
    .from(events)
    .where(and(eq(events.delivery, 'sent'), gte(events.ts, now - 2 * DEDUPE_WINDOW)))
    .orderBy(desc(events.ts))
    .all()
  const lastSent = new Map<string, number>()
  for (const row of sent) if (!lastSent.has(dedupeKey(row))) lastSent.set(dedupeKey(row), row.ts)
  return {
    lastSent,
    offlineSent: latestDeliveryPerDevice(db, 'offline'),
    weakSent: latestDeliveryPerDevice(db, 'signal_weak'),
    txErrorsSent: latestDeliveryPerDevice(db, 'tx_errors_high'),
  }
}

const HIGH_PRIORITY = new Set(['offline', 'signal_weak', 'bridge_offline'])

const mark = (db: Db, ids: number[], delivery: string) => {
  if (ids.length > 0) db.update(events).set({ delivery }).where(inArray(events.id, ids)).run()
}

/**
 * Works off the pending events: sends what the rules allow, marks the rest skipped, leaves an
 * offline event waiting until its time is up. Without any channel everything is skipped.
 */
export const runNotifications = async (
  db: Db,
  now: number,
  settings: Settings,
  publish: MqttPublisher | null,
  log?: Log,
) => {
  const pending = db
    .select({
      id: events.id,
      ts: events.ts,
      kind: events.kind,
      type: events.type,
      protocol: events.protocol,
      deviceId: events.deviceId,
      details: events.details,
      name: devices.name,
      customName: devices.customName,
      address: devices.address,
      online: devices.online,
    })
    .from(events)
    .leftJoin(devices, eq(devices.id, events.deviceId))
    .where(isNull(events.delivery))
    .orderBy(asc(events.ts), asc(events.id))
    .all()
  if (pending.length === 0) return { sent: 0, skipped: 0, failed: 0 }
  if (!hasChannel(settings.channels)) {
    mark(
      db,
      pending.map((e) => e.id),
      'skipped',
    )
    return { sent: 0, skipped: pending.length, failed: 0 }
  }

  const past = history(db, now)
  const lastSent = new Map(past.lastSent)
  const offlineSent = new Set(past.offlineSent)
  const weakSent = new Set(past.weakSent)
  const txErrorsSent = new Set(past.txErrorsSent)
  const counts = { sent: 0, skipped: 0, failed: 0 }

  for (const event of pending) {
    const decision: Decision = decide(
      {
        id: event.id,
        ts: event.ts,
        type: event.type,
        deviceId: event.deviceId,
        deviceOnline: event.online,
      },
      settings.rules,
      { lastSent, offlineSent, weakSent, txErrorsSent },
      now,
    )
    if (decision === 'wait') continue
    if (decision === 'skip') {
      mark(db, [event.id], 'skipped')
      counts.skipped++
      if (event.deviceId !== null && event.type === 'offline') offlineSent.delete(event.deviceId)
      if (event.deviceId !== null && event.type === 'signal_weak') weakSent.delete(event.deviceId)
      if (event.deviceId !== null && event.type === 'tx_errors_high')
        txErrorsSent.delete(event.deviceId)
      continue
    }
    const note = notification(
      {
        ...event,
        details: event.details ?? {},
        device: event.address
          ? { name: event.customName ?? event.name ?? event.address, address: event.address }
          : null,
      },
      settings.language,
      settings.publicUrl,
    )
    const results = await sendAll(
      settings.channels,
      note,
      publish,
      HIGH_PRIORITY.has(event.type) ? 'high' : 'default',
    )
    const ok = results.some((r) => r.ok)
    for (const failure of results.filter((r) => !r.ok)) {
      log?.warn(
        { channel: failure.channel, error: failure.error, event: event.id },
        'notification failed',
      )
    }
    mark(db, [event.id], ok ? 'sent' : 'failed')
    counts[ok ? 'sent' : 'failed']++
    if (!ok) continue
    lastSent.set(dedupeKey(event), event.ts)
    if (event.deviceId !== null && event.type === 'offline') offlineSent.add(event.deviceId)
    if (event.deviceId !== null && event.type === 'signal_weak') weakSent.add(event.deviceId)
    if (event.deviceId !== null && event.type === 'tx_errors_high') txErrorsSent.add(event.deviceId)
  }
  return counts
}
