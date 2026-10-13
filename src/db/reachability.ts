import { and, eq, isNull, notInArray } from 'drizzle-orm'
import { reachability } from '~/core/reachability'
import { ROOT_ROLES } from '~/core/topology'
import type { Db } from './client'
import { devices } from './schema'
import { addEvent } from './store'

/**
 * Applies the reachability rule to every device and records a change as an offline or online
 * event. Devices never seen since Funkloch started keep their state.
 */
export const checkReachability = (db: Db, now: number) => {
  const rows = db
    .select()
    .from(devices)
    .where(and(isNull(devices.removedAt), notInArray(devices.role, ROOT_ROLES)))
    .all()
  let changed = 0
  db.transaction((tx) => {
    for (const device of rows) {
      const result = reachability({
        reported: device.reportedOnline,
        lastSeen: device.lastSeen,
        interval: device.typicalInterval,
        now,
      })
      if (result.reason === 'unknown' || result.online === device.online) continue
      changed++
      tx.update(devices).set({ online: result.online }).where(eq(devices.id, device.id)).run()
      addEvent(tx, {
        ts: now,
        kind: 'offline',
        type: result.online ? 'online' : 'offline',
        protocol: device.protocol,
        deviceId: device.id,
        details: {
          reason: result.reason,
          lastSeen: device.lastSeen,
          interval: device.typicalInterval,
        },
      })
    }
  })
  return changed
}
