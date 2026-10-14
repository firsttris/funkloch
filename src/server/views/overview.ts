import '@tanstack/react-start/server-only'
import { PROTOCOLS } from '~/adapters/registry'
import { channelBars } from '~/core/channels'
import { latestChannelScan, networkChannels } from '~/db/channels'
import { latestSamples, listedDevices } from '~/db/queries'
import { latestBottlenecks } from './bottlenecks'
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
    channels: channelView(db),
    thresholds: settings.thresholds,
    adapters: states,
    protocols: protocolInfo(protocolIds),
    counts: overview.counts,
    bottlenecks: latestBottlenecks(db, protocolIds, settings.thresholds.weak),
    rows: overview.rows.map((row) => {
      const sample = latest.get(row.id)
      const meta = PROTOCOLS[row.protocol]
      return { ...row, rawText: sample && meta ? meta.formatRaw(sample) : null }
    }),
  }
}

/** The newest energy scan with the channels the networks run on; null before the first scan */
const channelView = (db: ViewContext['db']) => {
  const scan = latestChannelScan(db)
  if (!scan) return null
  const networks = networkChannels(db)
  return {
    ts: scan.ts,
    bars: channelBars(scan.channels, networks),
    networks: Object.entries(networks).flatMap(([protocol, channel]) => {
      const meta = PROTOCOLS[protocol]
      return meta ? [{ protocol, label: meta.label, channel }] : []
    }),
  }
}

export type Overview = ReturnType<typeof overviewView>
