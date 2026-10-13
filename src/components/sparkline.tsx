/** A small SVG line of hourly scores (0–100); gaps (null) break the line. */
export const Sparkline = ({
  values,
  color,
  label,
  width = 130,
  height = 30,
}: {
  values: (number | null)[]
  color: string
  label: string
  width?: number
  height?: number
}) => {
  const step = values.length > 1 ? width / (values.length - 1) : 0
  const y = (v: number) => (height - 2 - (v / 100) * (height - 4)).toFixed(1)
  const segments: string[][] = [[]]
  values.forEach((value, i) => {
    if (value === null) {
      if ((segments.at(-1) as string[]).length > 0) segments.push([])
      return
    }
    ;(segments.at(-1) as string[]).push(`${(i * step).toFixed(1)},${y(value)}`)
  })
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      role="img"
      aria-label={label}
    >
      {segments
        .filter((points) => points.length > 0)
        .map((points) =>
          points.length === 1 ? (
            <circle
              key={points[0]}
              cx={points[0]?.split(',')[0]}
              cy={points[0]?.split(',')[1]}
              r="1.5"
              fill={color}
            />
          ) : (
            <polyline
              key={points[0]}
              points={points.join(' ')}
              fill="none"
              stroke={color}
              strokeWidth="1.6"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          ),
        )}
    </svg>
  )
}
