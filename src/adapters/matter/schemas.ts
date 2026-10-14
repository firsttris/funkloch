// Zod schemas for what Funkloch reads from matterjs-server: the WebSocket messages
// (packages/ws-client/src/models/model.ts, node.ts) and the attribute values it uses, whose struct
// fields are keyed by their Matter field id (packages/ws-client/src/topology/topology-utils.ts).
// Loose on purpose until recorded answers (tests/fixtures/recordings) settle the details.
import { z } from 'zod'

const id = z.union([z.number(), z.bigint()])

/** The first message after connecting, and the answer to server_info */
export const serverInfoSchema = z.looseObject({
  schema_version: z.number(),
  min_supported_schema_version: z.number().optional(),
  sdk_version: z.string().optional(),
})

/** A commissioned node with the server's cache of its attributes ("endpoint/cluster/attribute") */
export const nodeSchema = z.looseObject({
  node_id: id,
  available: z.boolean(),
  is_bridge: z.boolean().optional(),
  attributes: z.record(z.string(), z.unknown()),
})
export type NodeData = z.infer<typeof nodeSchema>

export const resultMessageSchema = z.looseObject({
  message_id: z.string(),
  result: z.unknown().optional(),
  error_code: z.number().optional(),
  details: z.string().optional(),
})

export const eventMessageSchema = z.looseObject({ event: z.string(), data: z.unknown() })

/** attribute_updated: [node_id, "endpoint/cluster/attribute", value] */
export const attributeUpdateSchema = z.tuple([id, z.string(), z.unknown()])

/** A Thread border router the server found over mDNS (@matter/thread-br-client BorderRouterEntry) */
export const borderRouterSchema = z.looseObject({
  extAddressHex: z.string().regex(/^[0-9a-fA-F]{16}$/),
  extendedPanIdHex: z.string().optional(),
  networkName: z.string().optional(),
  vendorName: z.string().optional(),
  modelName: z.string().optional(),
  hostname: z.string().optional(),
})
export type BorderRouter = z.infer<typeof borderRouterSchema>

const nullableNumber = z.number().nullable().optional()

/** ThreadNetworkDiagnostics NeighborTableStruct (0/53/7): how the node hears each neighbor */
export const neighborSchema = z.looseObject({
  /** ExtAddress, uint64 */
  '0': z.unknown(),
  /** Rloc16 */
  '2': z.number().optional(),
  /** Lqi: 0–255 in the spec, 0–3 from OpenThread */
  '5': z.number().optional(),
  /** AverageRssi, LastRssi in dBm */
  '6': nullableNumber,
  '7': nullableNumber,
  /** RxOnWhenIdle, FullThreadDevice, IsChild */
  '10': z.boolean().optional(),
  '11': z.boolean().optional(),
  '13': z.boolean().optional(),
})
export type Neighbor = z.infer<typeof neighborSchema>

/** GeneralDiagnostics NetworkInterface (0/51/0): field 4 HardwareAddress, field 7 Type */
export const networkInterfaceSchema = z.looseObject({
  '4': z.unknown().optional(),
  '7': z.number().optional(),
})

/** NetworkCommissioning NetworkInfoStruct (0/49/1): field 0 NetworkID, field 1 Connected */
export const networkInfoSchema = z.looseObject({
  '0': z.unknown().optional(),
  '1': z.boolean().optional(),
})
