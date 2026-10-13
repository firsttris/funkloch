// A day of hourly values as a small area chart: the line draws itself, the last value is a dot.
// Gaps (null) break the line; the scale is the day's range within the protocol's raw range.
export const HistoryArea = ({
  values,
  min,
  max,
  color,
  label,
  width = 280,
  height = 56,
}: {
  values: (number | null)[]
  min: number
  max: number
  color: string
  label: string
  width?: number
  height?: number
}) => {
  const step = values.length > 1 ? width / (values.length - 1) : 0
  // The day's own range with some air, inside the protocol's: a small dip still shows
  const known = values.filter((v): v is number => v !== null)
  const air = Math.max((max - min) * 0.06, (Math.max(...known) - Math.min(...known)) * 0.3)
  const lo = Math.max(min, Math.min(...known) - air)
  const hi = Math.min(max, Math.max(...known) + air)
  const y = (v: number) => height - 3 - ((v - lo) / (hi - lo || 1)) * (height - 6)
  const runs: { x: number; y: number }[][] = [[]]
  values.forEach((value, i) => {
    if (value === null) {
      if ((runs.at(-1)?.length ?? 0) > 0) runs.push([])
      return
    }
    runs.at(-1)?.push({ x: i * step, y: y(value) })
  })
  const last = runs.flat().at(-1)
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className="block h-14 w-full overflow-visible"
      role="img"
      aria-label={label}
    >
      {runs
        .filter((run) => run.length > 1)
        .map((run) => {
          const line = run
            .map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)},${p.y.toFixed(1)}`)
            .join('')
          const first = run[0] as { x: number }
          const end = run.at(-1) as { x: number }
          return (
            <g key={first.x}>
              <path
                d={`${line}L${end.x},${height}L${first.x},${height}Z`}
                fill={`color-mix(in srgb, ${color} 14%, transparent)`}
              />
              <path
                d={line}
                pathLength={1}
                className="history-line"
                fill="none"
                stroke={color}
                strokeWidth="1.8"
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
              />
            </g>
          )
        })}
      {last ? <circle cx={last.x} cy={last.y} r="3.5" fill={color} /> : null}
    </svg>
  )
}
