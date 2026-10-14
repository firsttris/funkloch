import '@tanstack/react-start/server-only'
import { heatmapRow } from '~/core/patterns'
import { hourStart } from '~/core/rollup'
import { DAY, HOUR } from '~/core/types'
import { eventsOfType, hourlyCells } from '~/db/queries'
import type { ViewContext } from './context'
import { adapterProtocols, adapterStates, deviceRows, protocolInfo } from './shared'

/** Share of hours that were weak or offline: the heatmap sorts by it, worst first */
const badness = (cells: string) => {
  const known = cells.replace(/-/g, '')
  return known.length === 0 ? -1 : (known.match(/[wo]/g)?.length ?? 0) / known.length
}

export const heatmapView = ({ db, now, settings, adapters }: ViewContext, days: 7 | 30) => {
  const to = hourStart(now)
  const from = to - days * DAY
  const hours = days * 24
  const overview = deviceRows(db, now, 24, settings.thresholds)
  const cells = Map.groupBy(hourlyCells(db, from), (c) => c.deviceId)
  const rows = overview.rows
    .map((row) => {
      const line = heatmapRow(cells.get(row.id) ?? [], from, hours, settings.thresholds)
      return {
        id: row.id,
        name: row.name,
        protocol: row.protocol,
        cells: line,
        badness: badness(line),
      }
    })
    .sort((a, b) => b.badness - a.badness || a.name.localeCompare(b.name))
  const names = new Map(overview.rows.map((r) => [r.id, r.name]))
  const states = adapterStates(adapters)

  return {
    now,
    days,
    from,
    thresholds: settings.thresholds,
    hourMs: HOUR,
    adapters: states,
    protocols: protocolInfo([
      ...new Set([...adapterProtocols(adapters), ...rows.map((r) => r.protocol)]),
    ]),
    rows: rows.map(({ badness: _, ...row }) => row),
    findings: {
      patterns: eventsOfType(db, 'pattern', now - 7 * DAY).flatMap((e) =>
        e.deviceId !== null && names.has(e.deviceId)
          ? [
              {
                id: e.deviceId,
                name: names.get(e.deviceId) as string,
                from: Number(e.details?.from),
                to: Number(e.details?.to),
                days: Number(e.details?.days),
              },
            ]
          : [],
      ),
      falling: overview.rows
        .filter((r) => r.trend === 'down')
        .map((r) => ({ id: r.id, name: r.name })),
      offline: overview.rows
        .filter((r) => r.status === 'offline')
        .map((r) => ({ id: r.id, name: r.name, lastSeen: r.lastSeen })),
    },
  }
}

export type HeatmapView = ReturnType<typeof heatmapView>
