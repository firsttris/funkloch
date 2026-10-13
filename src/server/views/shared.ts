import '@tanstack/react-start/server-only'
import { PROTOCOLS } from '~/adapters/registry'
import type { Adapter } from '~/adapters/types'
import { buildOverview } from '~/core/overview'
import type { Thresholds } from '~/core/score'
import { DAY, HOUR, type Role } from '~/core/types'
import type { Db } from '~/db/client'
import { displayName, hourlyMedians, listedDevices, parentNames, recentScores } from '~/db/queries'

/** What the client needs to know about a protocol */
export const protocolInfo = (ids: string[]) =>
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

export type ProtocolInfo = ReturnType<typeof protocolInfo>[number]

export const adapterStates = (adapters: readonly Adapter[]) =>
  adapters.map((adapter) => ({
    id: adapter.meta.id,
    label: adapter.meta.label,
    ...adapter.status(),
  }))

/** Every listed device with its status, score, sparkline and trend */
export const deviceRows = (db: Db, now: number, rangeHours: number, thresholds: Thresholds) =>
  buildOverview({
    now,
    rangeHours,
    devices: listedDevices(db).map((d) => ({
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
    thresholds,
  })
