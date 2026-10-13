import { EventEmitter } from 'node:events'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { CONNECT_WAIT, createMqttPublisher } from './mqtt'

// A broker that never answers
const broker = vi.hoisted(() => ({ client: null as null | import('node:events').EventEmitter }))
vi.mock('mqtt', () => ({
  default: {
    connect: () => {
      const client = Object.assign(new EventEmitter(), {
        connected: false,
        publishAsync: async () => {},
        end: (_force: boolean, _opts: object, done: () => void) => done(),
      })
      broker.client = client
      return client
    },
  },
}))

afterEach(() => vi.useRealTimers())

describe('createMqttPublisher', () => {
  test('a broker that stays away fails each publish and leaves no listener behind', async () => {
    vi.useFakeTimers()
    const publisher = createMqttPublisher({ url: 'mqtt://broker' })
    const sends = [publisher.publish('t', '1'), publisher.publish('t', '2')]
    const results = Promise.allSettled(sends)
    await vi.advanceTimersByTimeAsync(CONNECT_WAIT)
    expect((await results).map((r) => r.status)).toEqual(['rejected', 'rejected'])
    expect(broker.client?.listenerCount('connect')).toBe(0)
    await publisher.close()
  })
})
