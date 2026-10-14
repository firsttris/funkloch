import { eq } from 'drizzle-orm'
import { signalFormat } from '~/adapters/registry'
import { DEFAULT_SETTINGS } from '~/core/settings'
import { DAY, HOUR, MINUTE } from '~/core/types'
import { storeChannelScan, storeNetworkChannel } from '~/db/channels'
import type { Db } from '~/db/client'
import { detectPatterns, detectSignal, detectTrends, detectTxErrors } from '~/db/detect'
import { checkReachability } from '~/db/reachability'
import { applyRetention } from '~/db/retention'
import { rollupPending } from '~/db/rollup'
import { devices } from '~/db/schema'
import {
  addEvent,
  applyDevices,
  ensureDevice,
  storeBatch,
  storeCounters,
  storeTopology,
} from '~/db/store'
import { DEMO_DEVICES, DEMO_PROTOCOLS } from './devices'
import {
  availabilityChanges,
  channelScanAt,
  counterHistory,
  DEMO_CHANNELS,
  demoDeviceInfos,
  HISTORY_DAYS,
  history,
  linksAt,
} from './generate'

const TOPOLOGY_EVERY_HOURS = 6
const SCAN_EVERY_HOURS = 6
/** The newest scan is a few minutes old, as in the mockup */
const LAST_SCAN_AGO = 10 * MINUTE

/** Fills an empty database with 30 days of the demo network, as if Funkloch had been running. */
export const seedDemo = (db: Db, now: number) => {
  const start = now - HISTORY_DAYS * DAY
  for (const protocol of DEMO_PROTOCOLS)
    applyDevices(db, protocol, demoDeviceInfos(protocol), start)

  DEMO_DEVICES.forEach((device, i) => {
    storeBatch(db, history(device, now, i + 1), [])
    const counterDays = DEFAULT_SETTINGS.retention.samplesDays
    for (const reading of counterHistory(device, now, counterDays, i + 1))
      storeCounters(db, reading)
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
    for (const protocol of DEMO_PROTOCOLS) {
      storeTopology(db, {
        protocol,
        ts: now - hoursAgo * HOUR,
        links: linksAt(protocol, hoursAgo, now),
      })
    }
  }

  for (const [protocol, channel] of Object.entries(DEMO_CHANNELS))
    storeNetworkChannel(db, protocol, channel)
  for (let hoursAgo = 7 * 24; hoursAgo >= 0; hoursAgo -= SCAN_EVERY_HOURS) {
    storeChannelScan(db, now - hoursAgo * HOUR - LAST_SCAN_AGO, channelScanAt(hoursAgo + 1))
  }

  rollupPending(db, now, (HISTORY_DAYS + 1) * DAY)
  checkReachability(db, now)
  detectTrends(db, now)
  detectTxErrors(db, now)
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
