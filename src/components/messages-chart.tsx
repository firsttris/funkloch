/** Messages per hour as bars (own SVG: 48 values); hours without any message are tinted. */
export const MessagesChart = ({
  values,
  label,
  ticks,
}: {
  values: (number | null)[]
  label: string
  ticks: string[]
}) => {
  const width = 700
  const height = 120
  const max = Math.max(1, ...values.map((v) => v ?? 0))
  const barWidth = width / Math.max(values.length, 1)
  return (
    <div className="flex flex-col">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        className="block h-[120px] w-full"
        role="img"
        aria-label={label}
      >
        {values.map((value, i) => {
          const x = i * barWidth
          const key = `bar-${x}`
          const count = value ?? 0
          if (count === 0) {
            return (
              <rect key={key} x={x} y={0} width={barWidth} height={height} fill="var(--weak-bg)" />
            )
          }
          const barHeight = (count / max) * (height - 6)
          return (
            <rect
              key={key}
              x={x + 2}
              y={height - barHeight}
              width={Math.max(barWidth - 4, 1)}
              height={barHeight}
              fill="var(--chart-bar)"
            />
          )
        })}
        <line
          x1="0"
          x2={width}
          y1={height - 0.5}
          y2={height - 0.5}
          stroke="var(--chart-axis)"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <div
        aria-hidden="true"
        className="mt-1.5 flex justify-between font-mono text-[11px] text-foreground-subtle"
      >
        {ticks.map((tick) => (
          <span key={tick}>{tick}</span>
        ))}
      </div>
    </div>
  )
}
