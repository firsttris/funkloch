import type { EventDetails } from '~/db/schema'
import { eventDetail, eventTitle, kindLabel } from '~/lib/texts'
import type { Locale } from '~/paraglide/runtime.js'

export type NotificationEvent = {
  id: number
  ts: number
  kind: string
  type: string
  protocol: string | null
  deviceId: number | null
  device: { name: string; address: string } | null
  details: EventDetails
}

/** What every channel sends: a title, a line of text, a link, and the event as data */
export const notification = (event: NotificationEvent, locale: Locale, publicUrl: string) => {
  const title = event.device
    ? `${eventTitle(event, locale)}: ${event.device.name}`
    : eventTitle(event, locale)
  const base = publicUrl.replace(/\/+$/, '')
  const url = base
    ? event.deviceId !== null
      ? `${base}/devices/${event.deviceId}`
      : `${base}/events`
    : null
  return {
    title,
    message: eventDetail(event, locale) || kindLabel(event.kind, locale),
    url,
    payload: {
      id: event.id,
      time: new Date(event.ts).toISOString(),
      kind: event.kind,
      type: event.type,
      protocol: event.protocol,
      device: event.device ? { id: event.deviceId, ...event.device } : null,
      details: event.details,
      title,
      message: eventDetail(event, locale),
      url,
    },
  }
}

export type Notification = ReturnType<typeof notification>
