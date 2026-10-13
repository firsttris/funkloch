// One heatmap row as SVG: one path per colour, each hour a 1-unit-wide rectangle, day lines on top.
const COLORS = {
  g: 'var(--heat-good)',
  m: 'var(--heat-mid)',
  w: 'var(--heat-weak)',
  o: 'var(--heat-offline)',
  '-': 'var(--heat-none)',
} as const

type Code = keyof typeof COLORS

export const HeatRow = ({ cells, label }: { cells: string; label: string }) => {
  const paths: Record<Code, string> = { g: '', m: '', w: '', o: '', '-': '' }
  for (let i = 0; i < cells.length; i++) {
    const code = (cells[i] ?? '-') as Code
    paths[code] += `M${i} 0h1v1h-1Z`
  }
  const days = Math.round(cells.length / 24)
  const dayLines = Array.from({ length: days - 1 }, (_, i) => `M${(i + 1) * 24} 0v1`).join('')
  return (
    <svg
      viewBox={`0 0 ${cells.length} 1`}
      preserveAspectRatio="none"
      className="block h-6 w-full"
      shapeRendering="crispEdges"
      role="img"
      aria-label={label}
    >
      {(Object.keys(paths) as Code[]).map((code) =>
        paths[code] ? <path key={code} d={paths[code]} fill={COLORS[code]} /> : null,
      )}
      <path
        d={dayLines}
        stroke="var(--surface)"
        strokeWidth={2}
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  )
}
