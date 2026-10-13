import '@tanstack/react-start/server-only'
import { PROTOCOLS } from '~/adapters/registry'
import {
  type Range as DetailRange,
  detailKpis,
  hourlyChart,
  offlineIntervals,
  parentChanges,
  RANGES,
  rawChart,
  usesRawSamples,
} from '~/core/detail'
import { deviceStatus } from '~/core/devices'
import { hourlySeries } from '~/core/rollup'
import { median } from '~/core/stats'
import { trend } from '~/core/trend'
import { DAY, HOUR, type Role } from '~/core/types'
import {
  availabilityOf,
  deviceById,
  displayName,
  eventsOf,
  hourlyOf,
  latestSamples,
  latestSnapshot,
  linksOf,
  messagesPerHour,
  parentHistory,
  rawSamples,
  recentScores,
  samplesSince,
} from '~/db/queries'
import type { ViewContext } from './context'
import { protocolInfo } from './shared'

const linkKind = (deviceId: number, link: { fromId: number; parent: boolean }) => {
  if (!link.parent) return 'neighbor' as const
  return link.fromId === deviceId ? ('parent' as const) : ('child' as const)
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
  const deviceLinks = snapshot
    ? linksOf(db, device.id, snapshot.id)
        .map((l) => ({
          id: l.otherId,
          name: displayName(l),
          role: l.role as Role,
          kind: linkKind(device.id, l),
          lqi: l.lqi,
          rssi: l.rssi,
        }))
        .sort(
          (a, b) =>
            ['parent', 'child', 'neighbor'].indexOf(a.kind) -
              ['parent', 'child', 'neighbor'].indexOf(b.kind) || (b.lqi ?? 0) - (a.lqi ?? 0),
        )
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
      parentChanges: parentChanges(parentHistory(db, device.id, device.protocol, now - 7 * DAY)),
    },
    chart,
    offline: offlineIntervals(availability.changes, availability.onlineAtStart, from, now),
    messages: {
      from: messageFrom,
      values: hourlySeries(messagesPerHour(db, device.id, messageFrom, now), messageFrom, now),
    },
    topologyTs: snapshot?.ts ?? null,
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
