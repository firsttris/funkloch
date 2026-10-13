import { afterEach, describe, expect, test } from 'vitest'
import type { Change } from '~/core/live'
import { applyDevices, storeBatch } from '~/db/store'
import { tempDb } from '~/db/test-db'
import { createLiveFeed, liveResponse } from './live'

let cleanup = () => {}
afterEach(() => cleanup())

const setup = () => {
  const t = tempDb()
  applyDevices(
    t.db,
    'zigbee',
    [
      {
        protocol: 'zigbee',
        address: 'a',
        name: 'A',
        role: 'router',
        model: null,
        vendor: null,
        power: 'mains',
        networkAddress: null,
      },
    ],
    0,
  )
  const feed = createLiveFeed(t.db, 10)
  cleanup = () => {
    feed.stop()
    t.cleanup()
  }
  return { db: t.db, feed }
}

const sample = (ts: number) => ({
  protocol: 'zigbee',
  address: 'a',
  ts,
  score: 50,
  raw: 128,
  lqi: 128,
  rssi: null,
  battery: null,
  source: 'test',
})

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

describe('createLiveFeed', () => {
  test('tells listeners about new samples, once', async () => {
    const { db, feed } = setup()
    const seen: Change[] = []
    const unsubscribe = feed.subscribe((change) => seen.push(change))
    await wait(30)
    storeBatch(db, [sample(1000)], [])
    await wait(50)
    expect(seen).toEqual([{ samples: true, events: false, topology: false, devices: false }])
    unsubscribe()
    expect(feed.listeners()).toBe(0)
  })
})

describe('liveResponse', () => {
  test('streams a change as an SSE message and stops on abort', async () => {
    const { db, feed } = setup()
    const abort = new AbortController()
    const response = liveResponse(feed, abort.signal)
    expect(response.headers.get('content-type')).toContain('text/event-stream')
    const reader = (response.body as ReadableStream<Uint8Array>).getReader()
    const decoder = new TextDecoder()
    expect(decoder.decode((await reader.read()).value)).toBe('retry: 5000\n\n')
    await wait(30)
    storeBatch(db, [sample(2000)], [])
    const message = decoder.decode((await reader.read()).value)
    expect(message).toMatch(/^event: change\ndata: \{"samples":true/)
    abort.abort()
    expect((await reader.read()).done).toBe(true)
    expect(feed.listeners()).toBe(0)
  })
})
