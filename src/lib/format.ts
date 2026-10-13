import { DAY, HOUR, MINUTE } from '~/core/types'
import { m } from '~/paraglide/messages.js'
import { getLocale } from '~/paraglide/runtime.js'

/** "vor 5 min", relative to the `now` the server sent, so server and client render the same */
export const ago = (ts: number | null, now: number) => {
  if (ts === null) return m.never()
  const diff = Math.max(0, now - ts)
  if (diff < 5_000) return m.ago_now()
  if (diff < MINUTE) return m.ago_seconds({ n: Math.round(diff / 1000) })
  if (diff < HOUR) return m.ago_minutes({ n: Math.round(diff / MINUTE) })
  if (diff < 2 * DAY) return m.ago_hours({ n: Math.round(diff / HOUR) })
  return m.ago_days({ n: Math.round(diff / DAY) })
}

export const duration = (ms: number) => {
  if (ms < HOUR) return m.duration_minutes({ n: Math.max(1, Math.round(ms / MINUTE)) })
  if (ms < 2 * DAY) return m.duration_hours({ n: Math.round(ms / HOUR) })
  return m.duration_days({ n: Math.round(ms / DAY) })
}

export const number = (value: number, digits = 0) =>
  new Intl.NumberFormat(getLocale(), { maximumFractionDigits: digits }).format(value)

/** Signed percentage with a real minus sign: "−68 %" */
export const percent = (value: number) =>
  `${value > 0 ? '+' : value < 0 ? '−' : ''}${number(Math.abs(value))} %`

/** "Di 13.10. 05:48" in the browser's time zone */
export const dateTime = (ts: number) =>
  new Intl.DateTimeFormat(getLocale(), {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(ts)

/** "IKEA E1603", but "Eve Energy" rather than "Eve Eve Energy" */
export const modelText = (vendor: string | null, model: string | null) =>
  model && vendor && model.toLowerCase().startsWith(vendor.toLowerCase())
    ? model
    : [vendor, model].filter(Boolean).join(' ')
