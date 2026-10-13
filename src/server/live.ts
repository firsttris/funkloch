import '@tanstack/react-start/server-only'
import { sql } from 'drizzle-orm'
import { type Change, changes, type Fingerprint } from '~/core/live'
import type { Db } from '~/db/client'

export const LIVE_POLL_MS = 2000

/** Cheap: each is a max over a primary key or index */
export const fingerprint = (db: Db): Fingerprint => {
  const row = db.get<[number | null, number | null, number | null, number | null]>(sql`
    select (select max(ts) from samples), (select max(id) from events),
           (select max(id) from snapshots), (select max(rowid) + count(*) + sum(online) from devices)`)
  return { sample: row[0] ?? 0, event: row[1] ?? 0, snapshot: row[2] ?? 0, device: row[3] ?? 0 }
}

/** One poller for all listeners: looks at the database every 2 s and tells them what changed */
export const createLiveFeed = (db: Db, every = LIVE_POLL_MS) => {
  const listeners = new Set<(change: Change) => void>()
  let last = fingerprint(db)
  const timer = setInterval(() => {
    if (listeners.size === 0) {
      last = fingerprint(db)
      return
    }
    const next = fingerprint(db)
    const change = changes(last, next)
    last = next
    if (change) for (const listener of listeners) listener(change)
  }, every)
  return {
    subscribe: (listener: (change: Change) => void) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    listeners: () => listeners.size,
    stop: () => clearInterval(timer),
  }
}

export type LiveFeed = ReturnType<typeof createLiveFeed>

const encoder = new TextEncoder()

/** A text/event-stream response: one `change` message per change, a comment every 25 s */
export const liveResponse = (feed: LiveFeed, signal: AbortSignal) => {
  let unsubscribe = () => {}
  let heartbeat: ReturnType<typeof setInterval> | undefined
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (text: string) => {
        try {
          controller.enqueue(encoder.encode(text))
        } catch {
          close()
        }
      }
      const close = () => {
        unsubscribe()
        clearInterval(heartbeat)
        try {
          controller.close()
        } catch {}
      }
      send('retry: 5000\n\n')
      unsubscribe = feed.subscribe((change) =>
        send(`event: change\ndata: ${JSON.stringify(change)}\n\n`),
      )
      heartbeat = setInterval(() => send(': ping\n\n'), 25_000)
      signal.addEventListener('abort', close)
    },
    cancel() {
      unsubscribe()
      clearInterval(heartbeat)
    },
  })
  return new Response(stream, {
    headers: {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
      'x-accel-buffering': 'no',
    },
  })
}
