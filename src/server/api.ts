// Server functions: thin adapters from a request to the queries and the pure view builders.

import { notFound } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { PROTOCOLS } from '~/adapters/registry'
import {
  detailKpis,
  hourlyChart,
  offlineIntervals,
  parentChanges,
  RANGES,
  rawChart,
  usesRawSamples,
} from '~/core/detail'
import { deviceStatus } from '~/core/devices'
import { buildOverview } from '~/core/overview'
import { hourlySeries } from '~/core/rollup'
import { DEFAULT_THRESHOLDS } from '~/core/score'
import { median } from '~/core/stats'
import { trend } from '~/core/trend'
import { DAY, HOUR, type Role } from '~/core/types'
import {
  availabilityOf,
  deviceById,
  displayName,
  eventsOf,
  hourlyMedians,
  hourlyOf,
  latestSamples,
  latestSnapshot,
  linksOf,
  listedDevices,
  messagesPerHour,
  parentHistory,
  parentNames,
  rawSamples,
  recentScores,
  samplesSince,
} from '~/db/queries'
import { getRuntime } from './runtime'

export const overviewRangeSchema = z.enum(['24h', '7d']).default('24h')
export const detailRangeSchema = z.enum(['24h', '7d', '30d']).default('7d')

/** What the client needs to know about the protocols that are on */
const protocolInfo = (ids: string[]) =>
  ids.flatMap((id) => {
    const meta = PROTOCOLS[id]
    return meta
      ? [
          {
            id,
            label: meta.label,
            rawLabel: meta.raw.label,
            rawUnit: meta.raw.unit,
            rawMin: meta.raw.min,
            rawMax: meta.raw.max,
          },
        ]
      : []
  })

const adapterStates = () =>
  getRuntime().adapters.map((adapter) => ({
    id: adapter.meta.id,
    label: adapter.meta.label,
    ...adapter.status(),
  }))

export const getOverview = createServerFn({ method: 'GET' })
  .validator(z.object({ range: overviewRangeSchema }))
  .handler(({ data }) => {
    const { db } = getRuntime()
    const now = Date.now()
    const rangeHours = data.range === '7d' ? 7 * 24 : 24
    const devices = listedDevices(db)
    const latest = latestSamples(db)
    const overview = buildOverview({
      now,
      rangeHours,
      devices: devices.map((d) => ({
        id: d.id,
        protocol: d.protocol,
        name: displayName(d),
        model: d.model,
        vendor: d.vendor,
        role: d.role as Role,
        online: d.online,
        lastSeen: d.lastSeen,
      })),
      recentScores: recentScores(db, now - HOUR),
      hourly: hourlyMedians(db, now - Math.max(rangeHours * HOUR, 3 * DAY), now),
      via: parentNames(db),
      thresholds: DEFAULT_THRESHOLDS,
    })
    const adapters = adapterStates()
    const protocolIds = [
      ...new Set([...adapters.map((a) => a.id), ...devices.map((d) => d.protocol)]),
    ]
    return {
      now,
      range: data.range,
      adapters,
      protocols: protocolInfo(protocolIds),
      counts: overview.counts,
      rows: overview.rows.map((row) => {
        const sample = latest.get(row.id)
        const meta = PROTOCOLS[row.protocol]
        return { ...row, rawText: sample && meta ? meta.formatRaw(sample) : null }
      }),
    }
  })

export type Overview = Awaited<ReturnType<typeof getOverview>>

const linkKind = (deviceId: number, link: { fromId: number; parent: boolean }) => {
  if (!link.parent) return 'neighbor' as const
  return link.fromId === deviceId ? ('parent' as const) : ('child' as const)
}

export const getDeviceDetail = createServerFn({ method: 'GET' })
  .validator(z.object({ id: z.number().int().positive(), range: detailRangeSchema }))
  .handler(({ data }) => {
    const { db } = getRuntime()
    const device = deviceById(db, data.id)
    if (!device) throw notFound()
    const now = Date.now()
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
      status: deviceStatus(device.online, score, DEFAULT_THRESHOLDS),
      trend: trend(medians, now),
      current: latest
        ? { raw: latest.raw, text: meta?.formatRaw(latest) ?? String(latest.raw) }
        : null,
      weakRaw: meta?.rawAtScore?.(DEFAULT_THRESHOLDS.weak) ?? null,
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
  })

export type DeviceDetail = Awaited<ReturnType<typeof getDeviceDetail>>

/** For /healthz: the database answers and the adapters are connected */
export const health = () => {
  const runtime = getRuntime()
  let database = true
  try {
    runtime.db.$client.query('select 1').get()
  } catch {
    database = false
  }
  const adapters = adapterStates()
  return { ok: database && adapters.every((a) => a.connected), database, adapters }
}
