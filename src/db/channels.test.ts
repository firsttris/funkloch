import { afterEach, describe, expect, test } from 'vitest'
import {
  latestChannelScan,
  networkChannels,
  storeChannelScan,
  storeNetworkChannel,
} from './channels'
import { events } from './schema'
import { tempDb } from './test-db'

let cleanup = () => {}
afterEach(() => cleanup())

const setup = () => {
  const t = tempDb()
  cleanup = t.cleanup
  return t.db
}

describe('channel scans', () => {
  test('the newest scan and the network channels', () => {
    const db = setup()
    expect(latestChannelScan(db)).toBeNull()
    storeNetworkChannel(db, 'zigbee', 15)
    storeNetworkChannel(db, 'thread', 25)
    storeNetworkChannel(db, 'thread', 20)
    storeChannelScan(db, 1000, [{ channel: 11, energy: -64 }])
    storeChannelScan(db, 2000, [
      { channel: 12, energy: -62 },
      { channel: 11, energy: -60 },
    ])
    expect(networkChannels(db)).toEqual({ zigbee: 15, thread: 20 })
    expect(latestChannelScan(db)).toEqual({
      ts: 2000,
      channels: [
        { channel: 11, energy: -60 },
        { channel: 12, energy: -62 },
      ],
    })
  })

  test('a network channel that turns busy is one event', () => {
    const db = setup()
    storeNetworkChannel(db, 'zigbee', 15)
    storeChannelScan(db, 1000, [{ channel: 15, energy: -88 }])
    storeChannelScan(db, 2000, [{ channel: 15, energy: -70.4 }])
    storeChannelScan(db, 3000, [{ channel: 15, energy: -69 }])
    expect(
      db
        .select()
        .from(events)
        .all()
        .map((e) => [e.ts, e.type, e.protocol, e.details]),
    ).toEqual([[2000, 'channel_busy', 'zigbee', { channel: 15, energy: -70 }]])
  })
})
