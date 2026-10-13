import { slope } from './stats'
import { DAY, HOUR, type Trend } from './types'

export const TREND_WINDOW = 3 * DAY
export const TREND_CHANGE = 15
/** Fewer hourly medians than this in the window give no trend */
export const TREND_MIN_HOURS = 24

/**
 * Each value minus the mean of its hour of the day in the window. A daily rhythm (a socket that is
 * weak every evening) then no longer tilts the line by where its dips fall in the window, which
 * made the trend depend on the time of day; a change from day to day stays.
 */
const withoutDailyRhythm = (points: readonly { hour: number; median: number }[]) => {
  const slot = (hour: number) => Math.floor(hour / HOUR) % 24
  const byHour = Map.groupBy(points, (p) => slot(p.hour))
  const mean = new Map(
    [...byHour].map(([h, list]) => [h, list.reduce((sum, p) => sum + p.median, 0) / list.length]),
  )
  return points.map((p) => ({ x: p.hour / HOUR, y: p.median - (mean.get(slot(p.hour)) ?? 0) }))
}

/**
 * Slope of a linear regression over the hourly score medians of the last 72 h, without their daily
 * rhythm, as the change it predicts over the whole window. A drop of more than 15 points is a
 * falling trend, a rise of more than 15 a rising one.
 */
export const trend = (hourly: readonly { hour: number; median: number }[], now: number): Trend => {
  const recent = hourly.filter((h) => h.hour >= now - TREND_WINDOW && h.hour <= now)
  if (recent.length < TREND_MIN_HOURS) return 'none'
  const perHour = slope(withoutDailyRhythm(recent))
  if (perHour === null) return 'none'
  const change = (perHour * TREND_WINDOW) / HOUR
  return change < -TREND_CHANGE ? 'down' : change > TREND_CHANGE ? 'up' : 'flat'
}
