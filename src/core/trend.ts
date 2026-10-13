import { slope } from './stats'
import { DAY, HOUR, type Trend } from './types'

export const TREND_WINDOW = 3 * DAY
export const TREND_CHANGE = 15
/** Fewer hourly medians than this in the window give no trend */
export const TREND_MIN_HOURS = 24

/**
 * Slope of a linear regression over the hourly score medians of the last 72 h, as the change it
 * predicts over the whole window. A drop of more than 15 points is a falling trend, a rise of more
 * than 15 a rising one.
 */
export const trend = (hourly: readonly { hour: number; median: number }[], now: number): Trend => {
  const recent = hourly.filter((h) => h.hour >= now - TREND_WINDOW && h.hour <= now)
  if (recent.length < TREND_MIN_HOURS) return 'none'
  const perHour = slope(recent.map((h) => ({ x: h.hour / HOUR, y: h.median })))
  if (perHour === null) return 'none'
  const change = (perHour * TREND_WINDOW) / HOUR
  return change < -TREND_CHANGE ? 'down' : change > TREND_CHANGE ? 'up' : 'flat'
}
