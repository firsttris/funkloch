import '@tanstack/react-start/server-only'
import { DAY } from '~/core/types'
import { eventCounts, eventsSince } from '~/db/queries'
import type { ViewContext } from './context'
import { adapterStates, protocolInfo } from './shared'

export const EVENT_KINDS = ['offline', 'signal', 'topology', 'network'] as const
export type EventKindFilter = (typeof EVENT_KINDS)[number] | 'all'
export const EVENT_DAYS = [7, 30, 90] as const

export const MAX_EVENTS = 1000

export const eventsView = (
  { db, now, adapters }: ViewContext,
  kind: EventKindFilter,
  days: number,
  limit = MAX_EVENTS,
) => {
  const from = now - days * DAY
  const stored = eventCounts(db, from)
  const states = adapterStates(adapters)
  const counts = {
    all: Object.values(stored).reduce((sum, n) => sum + n, 0),
    ...Object.fromEntries(EVENT_KINDS.map((k) => [k, stored[k] ?? 0])),
  } as Record<EventKindFilter, number>
  return {
    now,
    kind,
    days,
    adapters: states,
    protocols: protocolInfo(states.map((a) => a.id)),
    counts,
    /** The list stops at `limit`; the counts and the CSV have them all */
    truncated: counts[kind] > limit,
    events: eventsSince(db, from, kind === 'all' ? null : kind, limit).map((e) => ({
      id: e.id,
      ts: e.ts,
      kind: e.kind,
      type: e.type,
      protocol: e.protocol,
      deviceId: e.deviceId,
      device: e.customName ?? e.name,
      details: e.details ?? {},
    })),
  }
}

export type EventsView = ReturnType<typeof eventsView>

const csvCell = (value: unknown) => {
  const text = value === null || value === undefined ? '' : String(value)
  return /[",\n;]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

/** All events of the range as CSV: one row per event, the details as JSON */
export const eventsCsv = ({ db, now }: ViewContext, kind: EventKindFilter, days: number) => {
  const rows = eventsSince(db, now - days * DAY, kind === 'all' ? null : kind, 100_000)
  const header = ['time', 'kind', 'type', 'protocol', 'device', 'address', 'details']
  const lines = rows.map((e) =>
    [
      new Date(e.ts).toISOString(),
      e.kind,
      e.type,
      e.protocol,
      e.customName ?? e.name,
      e.address,
      JSON.stringify(e.details ?? {}),
    ]
      .map(csvCell)
      .join(','),
  )
  return `${[header.join(','), ...lines].join('\n')}\n`
}
