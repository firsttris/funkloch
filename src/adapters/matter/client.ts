// One WebSocket connection to matterjs-server (docs/websockets_api.md): requests by message id,
// events as they come. Every request returns a result instead of throwing; the adapter reconnects.
import type { z } from 'zod'
import { eventMessageSchema, resultMessageSchema } from './schemas'
import { parseWire, stringifyWire } from './wire'

export type Result<T> = { ok: true; value: T } | { ok: false; error: string }

/** The part of a WebSocket the client uses, so tests can hand in a fake */
export type Socket = {
  send: (data: string) => void
  close: () => void
  onopen: (() => void) | null
  onmessage: ((event: { data: unknown }) => void) | null
  onclose: (() => void) | null
  onerror: (() => void) | null
}

export type ClientHandlers = {
  /** The first message after connecting is the server_info, without a message id */
  onServerInfo: (info: unknown) => void
  onEvent: (event: string, data: unknown) => void
  onClose: () => void
}

const TIMEOUT = 60_000

/** ws://host:5580 and ws://host:5580/ws both reach the server, which listens on /ws */
export const wsUrl = (url: string) => {
  const parsed = new URL(url)
  if (parsed.pathname === '/' || parsed.pathname === '') parsed.pathname = '/ws'
  return parsed.toString()
}

export const connectMatter = (
  url: string,
  handlers: ClientHandlers,
  open: (url: string) => Socket = (target) => new WebSocket(target) as unknown as Socket,
) => {
  const socket = open(wsUrl(url))
  const pending = new Map<string, (result: Result<unknown>) => void>()
  let next = 0
  let closed = false

  const settleAll = (error: string) => {
    for (const settle of pending.values()) settle({ ok: false, error })
    pending.clear()
  }

  socket.onmessage = (event) => {
    let message: unknown
    try {
      message = parseWire(String(event.data))
    } catch {
      return
    }
    const result = resultMessageSchema.safeParse(message)
    if (result.success) {
      const settle = pending.get(result.data.message_id)
      pending.delete(result.data.message_id)
      settle?.(
        result.data.error_code === undefined
          ? { ok: true, value: result.data.result ?? null }
          : {
              ok: false,
              error: `error ${result.data.error_code}: ${result.data.details ?? 'no details'}`,
            },
      )
      return
    }
    const parsedEvent = eventMessageSchema.safeParse(message)
    if (parsedEvent.success) handlers.onEvent(parsedEvent.data.event, parsedEvent.data.data)
    else handlers.onServerInfo(message)
  }
  socket.onclose = () => {
    if (closed) return
    closed = true
    settleAll('connection closed')
    handlers.onClose()
  }
  socket.onerror = () => socket.close()

  const request = <T>(
    command: string,
    schema: z.ZodType<T>,
    args?: Record<string, unknown>,
  ): Promise<Result<T>> =>
    new Promise((resolve) => {
      if (closed) {
        resolve({ ok: false, error: 'connection closed' })
        return
      }
      const id = String(++next)
      const timer = setTimeout(() => {
        pending.delete(id)
        resolve({ ok: false, error: `${command}: no answer within ${TIMEOUT / 1000} s` })
      }, TIMEOUT)
      pending.set(id, (result) => {
        clearTimeout(timer)
        if (!result.ok) {
          resolve({ ok: false, error: `${command}: ${result.error}` })
          return
        }
        const parsed = schema.safeParse(result.value)
        resolve(
          parsed.success
            ? { ok: true, value: parsed.data }
            : { ok: false, error: `${command}: ${parsed.error.issues[0]?.message ?? 'invalid'}` },
        )
      })
      socket.send(stringifyWire({ message_id: id, command, ...(args ? { args } : {}) }))
    })

  return {
    request,
    close: () => {
      if (closed) return
      closed = true
      settleAll('connection closed')
      socket.close()
    },
  }
}

export type MatterClient = ReturnType<typeof connectMatter>
