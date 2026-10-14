import '@tanstack/react-start/server-only'
import { PROTOCOLS } from '~/adapters/registry'
import {
  connections,
  type Range as DetailRange,
  detailKpis,
  hourlyChart,
  offlineIntervals,
  parentChanges,
  parentSince,
  RANGES,
  rawChart,
  usesRawSamples,
} from '~/core/detail'
import { deviceStatus } from '~/core/devices'
import { hourlySeries } from '~/core/rollup'
import { routerFinding } from '~/core/router-finding'
import { median } from '~/core/stats'
import { trend } from '~/core/trend'
import {
  counterDeltas,
  hourlyTxErrorRates,
  TX_ERROR_WARN,
  TX_ERROR_WINDOW,
  txErrorRate,
} from '~/core/tx-errors'
import { DAY, HOUR, type Role } from '~/core/types'
import {
  availabilityOf,
  countersOf,
  deviceById,
  devicesOfProtocol,
  displayName,
  eventsOf,
  hourlyOf,
  latestSamples,
  latestSnapshot,
  linksOf,
  linksOfSnapshot,
  messagesPerHour,
  parentsOverTime,
  rawSamples,
  recentScores,
  samplesSince,
} from '~/db/queries'
import type { ViewContext } from './context'
import { deviceRows, protocolInfo } from './shared'

/** How long back a child's parent history is read for "connected since" */
const SINCE_WINDOW = 90 * DAY

/** Days the transmit error chart covers */
const TX_ERROR_DAYS = 7

/** The transmit error rate of the last day and per hour; null for a device without counters */
const txErrorsView = (db: ViewContext['db'], deviceId: number, high: boolean, now: number) => {
  const from = now - TX_ERROR_DAYS * DAY + HOUR
  const readings = countersOf(db, deviceId, from - HOUR)
  if (readings.length === 0) return null
  const deltas = counterDeltas(readings)
  return {
    high,
    threshold: TX_ERROR_WARN * 100,
    day: txErrorRate(deltas, now - TX_ERROR_WINDOW),
    from,
    hourly: hourlyTxErrorRates(deltas, from, now),
  }
}

/**
 * Whether a router does its job, from the newest snapshot, with the link values written the
 * protocol's way; null for other roles or without a snapshot
 */
const findingView = (
  { db, settings }: Pick<ViewContext, 'db' | 'settings'>,
  device: { id: number; protocol: string; role: string },
  snapshotId: number | null,
) => {
  const meta = PROTOCOLS[device.protocol]
  if (device.role !== 'router' || snapshotId === null || !meta) return null
  const finding = routerFinding({
    id: device.id,
    nodes: devicesOfProtocol(db, device.protocol).map((d) => ({
      id: d.id,
      name: displayName(d),
      role: d.role as Role,
    })),
    links: linksOfSnapshot(db, snapshotId).map((l) => ({
      from: l.fromId,
      to: l.toId,
      lqi: l.lqi,
      rssi: l.rssi,
      parent: l.parent,
    })),
    linkScore: meta.linkScore,
    weak: settings.thresholds.weak,
  })
  const { uplink } = finding
  return {
    ...finding,
    // How the router hears its uplink first, then how the uplink hears it
    uplink: uplink ? { ...uplink, text: meta.formatLinkPair(uplink.back, uplink.there) } : null,
  }
}

/** Null when there is no such device */
export const deviceView = ({ db, now, settings }: ViewContext, id: number, range: DetailRange) => {
  const data = { id, range }
  const device = deviceById(db, data.id)
  if (!device) return null
  const from = now - RANGES[data.range]
  const meta = PROTOCOLS[device.protocol]
  const weekHourly = hourlyOf(db, device.id, now - 30 * DAY)
  const chart = usesRawSamples(data.range)
    ? rawChart(rawSamples(db, device.id, from))
    : hourlyChart(
        weekHourly.filter((h) => h.hour >= from - HOUR),
        from,
        now,
      )
  const latest = latestSamples(db).get(device.id) ?? null
  const recent = median(recentScores(db, now - HOUR).get(device.id) ?? [])
  const medians = weekHourly.flatMap((h) =>
    h.median === null ? [] : [{ hour: h.hour, median: h.median }],
  )
  const score = recent ?? medians.at(-1)?.median ?? null
  const availability = availabilityOf(db, device.id, from, now)
  const snapshot = latestSnapshot(db, device.protocol)
  const statusOf = new Map(
    deviceRows(db, now, 24, settings.thresholds).rows.map((r) => [r.id, r.status]),
  )
  const deviceLinks = snapshot
    ? connections(device.id, linksOf(db, device.id, snapshot.id), (l) =>
        meta ? meta.linkScore(l) : l.lqi,
      ).map((l) => ({
        id: l.otherId,
        name: displayName(l),
        role: l.role as Role,
        kind: l.kind,
        lqi: l.lqi,
        rssi: l.rssi,
        status: statusOf.get(l.otherId) ?? ('unknown' as const),
        // A child connected through this device: since when, to see a repeater take over
        since:
          l.kind === 'child'
            ? parentSince(
                parentsOverTime(db, l.otherId, device.protocol, now - SINCE_WINDOW),
                String(device.id),
              )
            : null,
      }))
    : []
  const messageFrom = now - 47 * HOUR
  return {
    now,
    range: data.range,
    protocol: protocolInfo([device.protocol])[0] ?? null,
    device: {
      id: device.id,
      protocol: device.protocol,
      name: displayName(device),
      customName: device.customName,
      networkName: device.name,
      address: device.address,
      networkAddress: device.networkAddress,
      model: device.model,
      vendor: device.vendor,
      role: device.role as Role,
      power: device.power,
      battery: device.battery,
      lastSeen: device.lastSeen,
      online: device.online,
    },
    status: deviceStatus(device.online, score, settings.thresholds),
    trend: trend(medians, now),
    current: latest
      ? { raw: latest.raw, text: meta?.formatRaw(latest) ?? String(latest.raw) }
      : null,
    weakRaw: meta?.rawAtScore?.(settings.thresholds.weak) ?? null,
    kpis: {
      ...detailKpis(weekHourly, samplesSince(db, device.id, now - 48 * HOUR), now),
      parentChanges: parentChanges(
        parentsOverTime(db, device.id, device.protocol, now - 7 * DAY).map((p) => p.parent),
      ),
    },
    chart,
    txErrors: txErrorsView(db, device.id, device.txErrorsHigh, now),
    offline: offlineIntervals(availability.changes, availability.onlineAtStart, from, now),
    messages: {
      from: messageFrom,
      values: hourlySeries(messagesPerHour(db, device.id, messageFrom, now), messageFrom, now),
    },
    topologyTs: snapshot?.ts ?? null,
    finding: findingView({ db, settings }, device, snapshot?.id ?? null),
    via: deviceLinks.find((l) => l.kind === 'parent')?.name ?? null,
    links: deviceLinks,
    events: eventsOf(db, device.id).map((e) => ({
      id: e.id,
      ts: e.ts,
      kind: e.kind,
      type: e.type,
      details: e.details ?? {},
    })),
  }
}

export type DeviceDetail = NonNullable<ReturnType<typeof deviceView>>
