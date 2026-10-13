import '@tanstack/react-start/server-only'
import { PROTOCOLS } from '~/adapters/registry'
import { latestSamples, listedDevices } from '~/db/queries'
import type { ViewContext } from './context'
import { adapterStates, deviceRows, protocolInfo } from './shared'

export type OverviewRange = '24h' | '7d'

export const overviewView = (
  { db, now, settings, adapters }: ViewContext,
  range: OverviewRange,
) => {
  const overview = deviceRows(db, now, range === '7d' ? 7 * 24 : 24, settings.thresholds)
  const latest = latestSamples(db)
  const states = adapterStates(adapters)
  const protocolIds = [
    ...new Set([...states.map((a) => a.id), ...listedDevices(db).map((d) => d.protocol)]),
  ]
  return {
    now,
    range,
    thresholds: settings.thresholds,
    adapters: states,
    protocols: protocolInfo(protocolIds),
    counts: overview.counts,
    rows: overview.rows.map((row) => {
      const sample = latest.get(row.id)
      const meta = PROTOCOLS[row.protocol]
      return { ...row, rawText: sample && meta ? meta.formatRaw(sample) : null }
    }),
  }
}

export type Overview = ReturnType<typeof overviewView>
