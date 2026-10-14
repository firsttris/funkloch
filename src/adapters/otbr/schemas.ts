// Zod schemas for the OTBR REST answers Funkloch reads. They follow ot-br-posix
// src/rest/openapi.yaml and src/rest/json.cpp (JSON:API collections under /api, the node resource
// /node). Loose on purpose until recorded answers (tests/fixtures/recordings) settle the details:
// unknown fields pass, optional fields stay optional.
import { z } from 'zod'

const hex16 = z.string().regex(/^[0-9a-fA-F]{16}$/)

/** JSON:API document: { data: [...] } or { data: {...} } */
const collection = <T extends z.ZodType>(item: T) => z.looseObject({ data: z.array(item) })
const single = <T extends z.ZodType>(item: T) => z.looseObject({ data: item })

export const deviceItemSchema = z.looseObject({
  id: z.string(),
  type: z.string(),
  attributes: z.looseObject({
    extAddress: hex16.optional(),
    rloc16: z.string().optional(),
    role: z.string().optional(),
    hostname: z.string().optional(),
    mode: z
      .looseObject({
        rxOnWhenIdle: z.boolean().optional(),
        fullThreadDevice: z.boolean().optional(),
      })
      .optional(),
  }),
})

export const devicesSchema = collection(deviceItemSchema)
export type DeviceItem = z.infer<typeof deviceItemSchema>

/** A neighbor or child of a router as the router sees it (json.cpp MeshRouterNeighborEntry2Json) */
export const linkEntrySchema = z.looseObject({
  extAddress: hex16,
  rloc16: z.string().optional(),
  linkMargin: z.number().optional(),
  averageRssi: z.number().optional(),
  lastRssi: z.number().optional(),
  rxOnWhenIdle: z.boolean().optional(),
})

export type LinkEntry = z.infer<typeof linkEntrySchema>

/**
 * The MAC counters TLV (src/rest/json.cpp MacCounters2Json), cumulative since the device started.
 * OpenThread fills ifOutErrors with the failed clear channel assessments (openthread
 * src/core/thread/net_diag_tlvs.cpp MacCountersTlvValue::InitFrom: mTxErrCca) and the packet
 * counters with the unique transmission requests (mTxUnicast, mTxBroadcast).
 */
export const macCountersSchema = z.looseObject({
  ifOutErrors: z.number(),
  ifOutUcastPkts: z.number(),
  ifOutBroadcastPkts: z.number(),
})

export type MacCounters = z.infer<typeof macCountersSchema>

/**
 * The border router names its items "networkDiagnostics" (src/rest/rest_diagnostics_coll.hpp
 * NWK_DIAG_TYPE_NAME); openapi.yaml says "threadNetworkDiagnostic". Both are read.
 */
export const NETWORK_DIAGNOSTIC_TYPES = ['networkDiagnostics', 'threadNetworkDiagnostic'] as const

export const networkDiagnosticSchema = z.looseObject({
  id: z.string(),
  type: z.enum(NETWORK_DIAGNOSTIC_TYPES),
  attributes: z.looseObject({
    created: z.string().optional(),
    extAddress: hex16,
    rloc16: z.string().optional(),
    routerNeighbors: z.array(linkEntrySchema).optional(),
    children: z.array(linkEntrySchema).optional(),
    macCounters: macCountersSchema.optional(),
    /** Set by the device's firmware; OpenThread's default is empty (src/core/config/net_diag.h) */
    vendorName: z.string().optional(),
    vendorModel: z.string().optional(),
    /** e.g. "openthread-esp32/-; esp32c6;  2026-10-13 13:51:58 UTC" */
    threadStackVersion: z.string().optional(),
    batteryLevel: z.number().nullish(),
  }),
})

export type NetworkDiagnostic = z.infer<typeof networkDiagnosticSchema>

export const energyScanSchema = z.looseObject({
  id: z.string(),
  type: z.literal('energyScanReport'),
  attributes: z.looseObject({
    created: z.string().optional(),
    report: z.array(z.looseObject({ channel: z.number().int(), maxRssi: z.array(z.number()) })),
  }),
})

export type EnergyScan = z.infer<typeof energyScanSchema>

/** Anything else in the diagnostics collection is kept but not read */
export const diagnosticsSchema = collection(z.looseObject({ id: z.string(), type: z.string() }))

export const actionItemSchema = z.looseObject({
  id: z.string(),
  type: z.string(),
  attributes: z.looseObject({ status: z.string().optional() }),
  relationships: z
    .looseObject({
      result: z
        .looseObject({ data: z.looseObject({ id: z.string(), type: z.string() }) })
        .optional(),
    })
    .optional(),
})

export const actionsSchema = collection(actionItemSchema)
export const actionSchema = single(actionItemSchema)
export type ActionItem = z.infer<typeof actionItemSchema>

/** GET /node (rest_web_server.cpp NodeInfo) */
export const nodeSchema = z.looseObject({
  State: z.union([z.string(), z.number()]).optional(),
  NetworkName: z.string().optional(),
  ExtAddress: z.string().optional(),
  ExtPanId: z.string().optional(),
  Rloc16: z.number().optional(),
  NumOfRouter: z.number().optional(),
})

/**
 * GET /node/dataset/active as JSON; only the channel is read, the keys are never stored. Current
 * images write "channel" (src/rest/json.cpp ActiveDataset2Json), older ones "Channel".
 */
export const datasetSchema = z
  .looseObject({ channel: z.number().int().optional(), Channel: z.number().int().optional() })
  .transform((dataset) => ({ channel: dataset.channel ?? dataset.Channel }))

/** GET /diagnostics of older images: router link qualities without RSSI */
export const legacyDiagnosticsSchema = z.array(
  z.looseObject({
    ExtAddress: hex16,
    Rloc16: z.number().optional(),
    Mode: z
      .looseObject({ RxOnWhenIdle: z.number().optional(), DeviceType: z.number().optional() })
      .optional(),
    Route: z
      .looseObject({
        RouteData: z
          .array(
            z.looseObject({
              RouteId: z.number(),
              LinkQualityOut: z.number(),
              LinkQualityIn: z.number(),
            }),
          )
          .optional(),
      })
      .optional(),
    ChildTable: z.array(z.looseObject({ ChildId: z.number() })).optional(),
  }),
)

export type LegacyDiagnostics = z.infer<typeof legacyDiagnosticsSchema>

/** GET /api/diagnostics/{id}: one item, a network diagnostic or an energy scan */
export const diagnosticItemSchema = single(z.union([networkDiagnosticSchema, energyScanSchema]))
