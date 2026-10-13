import { eq } from 'drizzle-orm'
import { signalFormat } from '~/adapters/registry'
import { DEFAULT_SETTINGS } from '~/core/settings'
import { DAY, HOUR } from '~/core/types'
import type { Db } from '~/db/client'
import { detectPatterns, detectSignal, detectTrends } from '~/db/detect'
import { checkReachability } from '~/db/reachability'
import { applyRetention } from '~/db/retention'
import { rollupPending } from '~/db/rollup'
import { devices } from '~/db/schema'
import { addEvent, applyDevices, ensureDevice, storeBatch, storeTopology } from '~/db/store'
import { DEMO_DEVICES } from './devices'
import { availabilityChanges, demoDeviceInfos, HISTORY_DAYS, history, linksAt } from './generate'

const TOPOLOGY_EVERY_HOURS = 6

/** Fills an empty database with 30 days of the demo network, as if Funkloch had been running. */
export const seedDemo = (db: Db, now: number) => {
  const start = now - HISTORY_DAYS * DAY
  for (const protocol of ['zigbee', 'thread'])
    applyDevices(db, protocol, demoDeviceInfos(protocol), start)

  DEMO_DEVICES.forEach((device, i) => {
    storeBatch(db, history(device, now, i + 1), [])
    const deviceId = ensureDevice(db, device.protocol, device.address, start)
    for (const change of availabilityChanges(device, now)) {
      addEvent(db, {
        ts: change.ts,
        kind: 'offline',
        type: change.online ? 'online' : 'offline',
        protocol: device.protocol,
        deviceId,
        details: { reason: 'silent' },
      })
    }
    const stillOffline = (device.offline ?? []).some(([, to]) => to === 0)
    // Zigbee2MQTT reports it offline as well; set directly so the check makes no second event
    if (stillOffline) {
      db.update(devices)
        .set({ online: false, reportedOnline: false })
        .where(eq(devices.id, deviceId))
        .run()
    }
  })

  for (let hoursAgo = 7 * 24; hoursAgo >= 0; hoursAgo -= TOPOLOGY_EVERY_HOURS) {
    for (const protocol of ['zigbee', 'thread']) {
      storeTopology(db, {
        protocol,
        ts: now - hoursAgo * HOUR,
        links: linksAt(protocol, hoursAgo, now),
      })
    }
  }

  rollupPending(db, now, (HISTORY_DAYS + 1) * DAY)
  checkReachability(db, now)
  detectTrends(db, now)
  detectPatterns(db, now, DEFAULT_SETTINGS.thresholds)
  detectSignal(
    db,
    now,
    DEFAULT_SETTINGS.thresholds,
    DEFAULT_SETTINGS.rules.signal.minutes,
    signalFormat,
  )
  applyRetention(db, now)
}
