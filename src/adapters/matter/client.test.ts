import { describe, expect, test } from 'vitest'
import { z } from 'zod'
import { connectMatter, type Socket, wsUrl } from './client'
import { stringifyWire } from './wire'

describe('wsUrl', () => {
  test('the server listens on /ws', () => {
    expect(wsUrl('ws://localhost:5580')).toBe('ws://localhost:5580/ws')
    expect(wsUrl('ws://localhost:5580/ws')).toBe('ws://localhost:5580/ws')
    expect(wsUrl('wss://matter.example/custom')).toBe('wss://matter.example/custom')
  })
})

/** A socket that answers every request with the given reply */
const replying = (reply: (id: string) => unknown) => {
  const socket: Socket = {
    onopen: null,
    onmessage: null,
    onclose: null,
    onerror: null,
    send: (data) => {
      const { message_id } = JSON.parse(data) as { message_id: string }
      setTimeout(() => socket.onmessage?.({ data: stringifyWire(reply(message_id)) }), 0)
    },
    close: () => setTimeout(() => socket.onclose?.(), 0),
  }
  return socket
}

const handlers = { onServerInfo: () => {}, onEvent: () => {}, onClose: () => {} }

describe('connectMatter', () => {
  test('an error answer and an answer that misses the schema come back as values', async () => {
    const failing = connectMatter('ws://x', handlers, () =>
      replying((id) => ({ message_id: id, error_code: 5, details: 'Node not found' })),
    )
    expect(await failing.request('read_attribute', z.unknown())).toEqual({
      ok: false,
      error: 'read_attribute: error 5: Node not found',
    })
    const odd = connectMatter('ws://x', handlers, () =>
      replying((id) => ({ message_id: id, result: 'not a list' })),
    )
    const result = await odd.request('start_listening', z.array(z.unknown()))
    expect(result.ok).toBe(false)
  })

  test('a closed connection settles what is pending', async () => {
    const socket = replying(() => null)
    socket.send = () => {}
    const client = connectMatter('ws://x', handlers, () => socket)
    const pending = client.request('start_listening', z.unknown())
    socket.onclose?.()
    expect(await pending).toEqual({ ok: false, error: 'start_listening: connection closed' })
  })
})
