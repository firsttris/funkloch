import { z } from 'zod'

const flag = z
  .enum(['1', '0', 'true', 'false', ''])
  .optional()
  .transform((value) => value === '1' || value === 'true')

const optionalUrl = z
  .string()
  .optional()
  .transform((value) => (value ? value : undefined))
  .pipe(z.url().optional())

export const configSchema = z.object({
  ZIGBEE2MQTT_MQTT_URL: optionalUrl,
  ZIGBEE2MQTT_MQTT_USER: z.string().optional(),
  ZIGBEE2MQTT_MQTT_PASSWORD: z.string().optional(),
  ZIGBEE2MQTT_BASE_TOPIC: z.string().min(1).default('zigbee2mqtt'),
  ZIGBEE2MQTT_NETWORKMAP_HOURS: z.coerce.number().min(1).default(6),
  OTBR_URL: optionalUrl,
  PORT: z.coerce.number().int().positive().default(8090),
  DATA_DIR: z.string().min(1).default('./data'),
  FUNKLOCH_DEMO: flag,
  /**
   * The demo at a fixed moment (ISO time) that does not move on, and without live readings, so the
   * screenshots come out the same until the look changes
   */
  FUNKLOCH_DEMO_NOW: z
    .string()
    .optional()
    .transform((value) => (value ? value : undefined))
    .pipe(z.iso.datetime({ offset: true }).optional())
    .transform((value) => (value === undefined ? undefined : Date.parse(value))),
  /** Forget the admin password at start, for a forgotten one; remove it again afterwards */
  FUNKLOCH_RESET_PASSWORD: flag,
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),
})

export type Config = z.infer<typeof configSchema>

/** Reads the environment once; a wrong value stops the start with a clear message. */
export const loadConfig = (env: Record<string, string | undefined> = process.env): Config => {
  const result = configSchema.safeParse(env)
  if (!result.success) {
    throw new Error(`Invalid configuration:\n${z.prettifyError(result.error)}`)
  }
  return result.data
}
