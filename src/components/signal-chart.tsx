// uPlot wrapper for the device chart: median line, min–max band, offline stretches, the weak
// threshold and event markers. Colours come from the theme's CSS variables, so the chart follows
// light and dark mode.
import { useEffect, useRef } from 'react'
import uPlot from 'uplot'
import 'uplot/dist/uPlot.min.css'
import type { ChartSeries } from '~/core/detail'
import { dateFormat } from '~/lib/format'
import { timeZone } from '~/lib/time-zone'

export type ChartMarker = { ts: number; label: string }

type Props = {
  series: ChartSeries
  from: number
  to: number
  yMin: number
  yMax: number
  threshold: number | null
  offline: [number, number][]
  markers: ChartMarker[]
  band: boolean
  color: string
  label: string
  height?: number
}

const cssVar = (element: Element, name: string) =>
  getComputedStyle(element).getPropertyValue(name).trim()

const withAlpha = (color: string, alpha: number) =>
  color.startsWith('#') && color.length === 7
    ? `${color}${Math.round(alpha * 255)
        .toString(16)
        .padStart(2, '0')}`
    : color

const options = (props: Props, root: HTMLElement, width: number): uPlot.Options => {
  const line = cssVar(root, props.color) || '#c2410c'
  const grid = cssVar(root, '--chart-grid')
  const axis = cssVar(root, '--chart-axis')
  const text = cssVar(root, '--foreground-subtle')
  const gap = cssVar(root, '--chart-gap')
  const weak = cssVar(root, '--status-weak')
  const marker = cssVar(root, '--foreground')
  const font = `11px ${cssVar(root, '--font-mono') || 'monospace'}`
  const short = props.to - props.from <= 2 * 86_400_000
  const axisFormat = dateFormat(
    short
      ? { hour: '2-digit', minute: '2-digit' }
      : { weekday: 'short', day: '2-digit', month: '2-digit' },
  )
  const zone = timeZone()
  // Five ticks across the protocol's range: 0, 64, 128, 191, 255 for LQI
  const yTicks = [0, 1, 2, 3, 4].map((i) =>
    Math.round(props.yMin + ((props.yMax - props.yMin) * i) / 4),
  )

  const drawOverlays = (u: uPlot) => {
    const { ctx } = u
    const { top, height, left, width: plotWidth } = u.bbox
    ctx.save()
    ctx.fillStyle = gap
    for (const [start, end] of props.offline) {
      const x0 = u.valToPos(start / 1000, 'x', true)
      const x1 = u.valToPos(end / 1000, 'x', true)
      ctx.fillRect(
        Math.max(x0, left),
        top,
        Math.min(x1, left + plotWidth) - Math.max(x0, left),
        height,
      )
    }
    ctx.restore()
  }

  const drawLines = (u: uPlot) => {
    const { ctx } = u
    const { top, height, left, width: plotWidth } = u.bbox
    const ratio = devicePixelRatio
    ctx.save()
    if (props.threshold !== null) {
      const y = u.valToPos(props.threshold, 'y', true)
      ctx.strokeStyle = weak
      ctx.lineWidth = 1.5 * ratio
      ctx.setLineDash([6 * ratio, 4 * ratio])
      ctx.beginPath()
      ctx.moveTo(left, y)
      ctx.lineTo(left + plotWidth, y)
      ctx.stroke()
    }
    ctx.strokeStyle = marker
    ctx.lineWidth = ratio
    ctx.setLineDash([3 * ratio, 3 * ratio])
    for (const m of props.markers) {
      const x = u.valToPos(m.ts / 1000, 'x', true)
      ctx.beginPath()
      ctx.moveTo(x, top)
      ctx.lineTo(x, top + height)
      ctx.stroke()
    }
    ctx.restore()
  }

  return {
    width,
    height: props.height ?? 240,
    legend: { show: false },
    cursor: { y: false, points: { size: 6 } },
    // Ticks on whole hours and days of the server's time zone, as the labels
    ...(zone ? { tzDate: (ts: number) => uPlot.tzDate(new Date(ts * 1000), zone) } : {}),
    scales: {
      x: { time: true, range: () => [props.from / 1000, props.to / 1000] },
      y: { range: () => [props.yMin, props.yMax] },
    },
    axes: [
      {
        stroke: text,
        font,
        space: short ? 60 : 90,
        grid: { show: false },
        ticks: { stroke: axis, size: 4 },
        values: (_u, splits) => splits.map((s) => axisFormat.format(s * 1000)),
      },
      {
        stroke: text,
        font,
        size: 44,
        splits: () => yTicks,
        grid: { stroke: grid, width: 1 },
        ticks: { show: false },
      },
    ],
    series: [
      {},
      { stroke: 'transparent', points: { show: false } },
      { stroke: 'transparent', points: { show: false } },
      { stroke: line, width: 2, points: { show: false }, spanGaps: false },
    ],
    bands: props.band ? [{ series: [1, 2], fill: withAlpha(line, 0.16) }] : [],
    hooks: { drawClear: [drawOverlays], draw: [drawLines] },
  }
}

/** Marker labels closer than this share of the width go to a second row */
const MARKER_SPACING = 0.12

const markerRows = (markers: ChartMarker[], from: number, to: number) => {
  let lastInRow0 = -Infinity
  return [...markers]
    .sort((a, b) => a.ts - b.ts)
    .map((marker) => {
      const position = (marker.ts - from) / (to - from)
      const row = position - lastInRow0 < MARKER_SPACING ? 1 : 0
      if (row === 0) lastInRow0 = position
      return { ...marker, position, row }
    })
}

export const SignalChart = (props: Props) => {
  const container = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const element = container.current
    if (!element) return
    const data: uPlot.AlignedData = [
      props.series.x,
      props.series.max,
      props.series.min,
      props.series.median,
    ]
    const create = () =>
      new uPlot(options(props, document.documentElement, element.clientWidth), data, element)
    let plot = create()
    const resize = new ResizeObserver(() =>
      plot.setSize({ width: element.clientWidth, height: props.height ?? 240 }),
    )
    resize.observe(element)
    // Colours are read once per plot; a switch between light and dark draws it again
    const theme = new MutationObserver(() => {
      plot.destroy()
      plot = create()
    })
    theme.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    return () => {
      theme.disconnect()
      resize.disconnect()
      plot.destroy()
    }
  }, [props])

  return (
    <div className="flex flex-col">
      <div aria-hidden="true" className="relative h-11 text-[11px] font-semibold">
        {markerRows(props.markers, props.from, props.to).map((marker) => (
          <span
            key={`${marker.ts}-${marker.label}`}
            className="absolute -translate-x-1/2 whitespace-nowrap rounded bg-track px-1.5 py-px"
            style={{
              left: `calc(44px + (100% - 44px) * ${marker.position})`,
              top: marker.row === 0 ? 2 : 22,
            }}
          >
            {marker.label}
          </span>
        ))}
      </div>
      <div
        ref={container}
        role="img"
        aria-label={props.label}
        style={{ minHeight: props.height ?? 240 }}
      />
    </div>
  )
}
