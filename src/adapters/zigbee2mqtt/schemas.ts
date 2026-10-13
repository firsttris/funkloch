// Zod schemas for the Zigbee2MQTT payloads Funkloch reads. Shapes follow Koenkk/zigbee2mqtt
// lib/types/api.ts (2.x) and lib/extension/{bridge,availability,networkMap}.ts; fields Funkloch
// does not use are allowed through so a new Zigbee2MQTT release does not break parsing.
import { z } from 'zod'

const ieee = z.string().regex(/^0x[0-9a-fA-F]{16}$/)

export const bridgeDeviceSchema = z.looseObject({
  ieee_address: ieee,
  type: z.enum(['Coordinator', 'Router', 'EndDevice', 'Unknown', 'GreenPower']),
  network_address: z.number().int().nonnegative(),
  friendly_name: z.string(),
  disabled: z.boolean().optional(),
  definition: z
    .looseObject({ model: z.string(), vendor: z.string(), description: z.string().optional() })
    .nullish(),
  power_source: z.string().nullish(),
  model_id: z.string().nullish(),
  manufacturer: z.string().nullish(),
})

export type BridgeDevice = z.infer<typeof bridgeDeviceSchema>

export const bridgeDevicesSchema = z.array(bridgeDeviceSchema)

/** A device's state message; only the fields Funkloch reads are checked. */
export const deviceStateSchema = z.looseObject({
  linkquality: z.number().min(0).max(255).nullish(),
  battery: z.number().min(0).max(100).nullish(),
})

/** 2.x publishes {"state":"online"}, 1.x and the legacy option a plain string. */
export const availabilitySchema = z
  .union([z.looseObject({ state: z.enum(['online', 'offline']) }), z.enum(['online', 'offline'])])
  .transform((value) => (typeof value === 'string' ? value : value.state) === 'online')

export const bridgeStateSchema = availabilitySchema

const networkmapNodeSchema = z.looseObject({
  ieeeAddr: z.string(),
  friendlyName: z.string(),
  type: z.string(),
  networkAddress: z.number(),
  failed: z.array(z.string()).optional(),
  lastSeen: z.number().nullish(),
})

const networkmapLinkSchema = z.looseObject({
  source: z.looseObject({ ieeeAddr: z.string(), networkAddress: z.number() }),
  target: z.looseObject({ ieeeAddr: z.string(), networkAddress: z.number() }),
  /** Zigbee neighbor table: 0 source is the parent, 1 source is a child, 2 sibling, 3 none */
  relationship: z.number().int(),
  lqi: z.number().optional(),
  /** @deprecated in Zigbee2MQTT 3.0, the only LQI field before 1.35 */
  linkquality: z.number().optional(),
  depth: z.number().optional(),
})

export const networkmapResponseSchema = z.looseObject({
  status: z.enum(['ok', 'error']),
  error: z.string().optional(),
  data: z
    .looseObject({
      type: z.literal('raw'),
      value: z.looseObject({
        nodes: z.array(networkmapNodeSchema),
        links: z.array(networkmapLinkSchema),
      }),
    })
    .optional(),
})

export type NetworkmapResponse = z.infer<typeof networkmapResponseSchema>
