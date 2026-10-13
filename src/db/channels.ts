// Energy scans and the channel each network runs on.
import { desc, eq, like } from 'drizzle-orm'
import { type ChannelEnergy, newlyBusy } from '~/core/channels'
import type { ProtocolId } from '~/core/types'
import type { Db } from './client'
import { channelScans, settings } from './schema'
import { addEvent, setSetting } from './store'

const CHANNEL_KEY = 'channel:'

/** The channel a protocol's network runs on, as its adapter reported it */
export const storeNetworkChannel = (db: Db, protocol: ProtocolId, channel: number) =>
  setSetting(db, `${CHANNEL_KEY}${protocol}`, channel)

export const networkChannels = (db: Db): Record<ProtocolId, number> =>
  Object.fromEntries(
    db
      .select()
      .from(settings)
      .where(like(settings.key, `${CHANNEL_KEY}%`))
      .all()
      .flatMap((row) =>
        typeof row.value === 'number' ? [[row.key.slice(CHANNEL_KEY.length), row.value]] : [],
      ),
  )

/** The newest energy scan, or null before the first */
export const latestChannelScan = (db: Db): { ts: number; channels: ChannelEnergy[] } | null => {
  const newest = db
    .select({ ts: channelScans.ts })
    .from(channelScans)
    .orderBy(desc(channelScans.ts))
    .limit(1)
    .get()
  if (!newest) return null
  const channels = db
    .select({ channel: channelScans.channel, energy: channelScans.energy })
    .from(channelScans)
    .where(eq(channelScans.ts, newest.ts))
    .orderBy(channelScans.channel)
    .all()
  return { ts: newest.ts, channels }
}

/** Stores one energy scan; a network channel that turns busy becomes an event */
export const storeChannelScan = (db: Db, ts: number, channels: readonly ChannelEnergy[]) =>
  db.transaction((tx) => {
    const previous = latestChannelScan(db)?.channels ?? []
    for (const c of channels) {
      tx.insert(channelScans)
        .values({ ts, channel: c.channel, energy: c.energy })
        .onConflictDoNothing()
        .run()
    }
    for (const busy of newlyBusy(previous, channels, networkChannels(db))) {
      addEvent(tx, {
        ts,
        kind: 'network',
        type: 'channel_busy',
        protocol: busy.protocol,
        deviceId: null,
        details: { channel: busy.channel, energy: Math.round(busy.energy) },
      })
    }
  })
