// Server functions: each validates its input with Zod and hands the request to a view.
import { notFound } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { getRuntime } from '../runtime'
import { deviceView } from '../views/device'
import { eventsView } from '../views/events'
import { heatmapView } from '../views/heatmap'
import { networkView } from '../views/network'
import { overviewView } from '../views/overview'

export const getOverview = createServerFn({ method: 'GET' })
  .validator(z.object({ range: z.enum(['24h', '7d']) }))
  .handler(({ data }) => overviewView(getRuntime().viewContext(), data.range))

export const getDeviceDetail = createServerFn({ method: 'GET' })
  .validator(z.object({ id: z.number().int().positive(), range: z.enum(['24h', '7d', '30d']) }))
  .handler(({ data }) => {
    const view = deviceView(getRuntime().viewContext(), data.id, data.range)
    if (!view) throw notFound()
    return view
  })

export const getNetwork = createServerFn({ method: 'GET' })
  .validator(
    z.object({
      protocol: z.string().min(1).max(40).nullable(),
      snapshot: z.number().int().positive().nullable(),
      device: z.number().int().positive().nullable(),
    }),
  )
  .handler(({ data }) =>
    networkView(getRuntime().viewContext(), data.protocol, data.snapshot, data.device),
  )

/** Asks the protocol for a fresh topology; Zigbee2MQTT answers within minutes */
export const requestTopology = createServerFn({ method: 'POST' })
  .validator(z.object({ protocol: z.string().min(1).max(40) }))
  .handler(({ data }) => {
    const adapter = getRuntime().adapters.find((a) => a.meta.id === data.protocol)
    if (!adapter?.requestTopology) return { requested: false }
    adapter.requestTopology()
    return { requested: true }
  })

export const getEvents = createServerFn({ method: 'GET' })
  .validator(
    z.object({
      kind: z.enum(['all', 'offline', 'signal', 'topology', 'network']),
      days: z.union([z.literal(7), z.literal(30), z.literal(90)]),
    }),
  )
  .handler(({ data }) => eventsView(getRuntime().viewContext(), data.kind, data.days))

export const getHeatmap = createServerFn({ method: 'GET' })
  .validator(z.object({ days: z.union([z.literal(7), z.literal(30)]) }))
  .handler(({ data }) => heatmapView(getRuntime().viewContext(), data.days))
