export const median = (values: readonly number[]): number | null => {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  const upper = sorted[middle] as number
  return sorted.length % 2 === 1 ? upper : ((sorted[middle - 1] as number) + upper) / 2
}

/** Least-squares slope of y over x; null with fewer than two distinct x values. */
export const slope = (points: readonly { x: number; y: number }[]): number | null => {
  const n = points.length
  if (n < 2) return null
  const meanX = points.reduce((sum, p) => sum + p.x, 0) / n
  const meanY = points.reduce((sum, p) => sum + p.y, 0) / n
  const sxx = points.reduce((sum, p) => sum + (p.x - meanX) ** 2, 0)
  if (sxx === 0) return null
  const sxy = points.reduce((sum, p) => sum + (p.x - meanX) * (p.y - meanY), 0)
  return sxy / sxx
}
