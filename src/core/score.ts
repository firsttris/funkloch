import type { Band } from './types'

export type Thresholds = {
  /** Score from which a signal counts as good */
  good: number
  /** Score below which a signal counts as weak */
  weak: number
}

export const DEFAULT_THRESHOLDS: Thresholds = { good: 60, weak: 25 }

export const clampScore = (value: number) => Math.min(100, Math.max(0, value))

/** Maps `value` linearly from [min, max] to 0–100, clamped at both ends. */
export const linearScore = (value: number, min: number, max: number) =>
  Math.round(clampScore(((value - min) / (max - min)) * 100))

/** Inverse of linearScore, for drawing a score threshold on a raw-value chart. */
export const scoreToRaw = (score: number, min: number, max: number) =>
  min + (clampScore(score) / 100) * (max - min)

export const band = (score: number, thresholds: Thresholds = DEFAULT_THRESHOLDS): Band =>
  score >= thresholds.good ? 'good' : score >= thresholds.weak ? 'mid' : 'weak'
