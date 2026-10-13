// Everything a user can change after the first start, as one validated object. Stored as JSON in
// the settings table; missing keys fall back to the defaults, so a newer version reads older data.
import { z } from 'zod'

const rule = <T extends z.ZodRawShape>(extra: T) => z.object({ enabled: z.boolean(), ...extra })

export const settingsSchema = z
  .object({
    thresholds: z
      .object({ good: z.number().int().min(1).max(100), weak: z.number().int().min(0).max(99) })
      .refine((t) => t.weak < t.good, { message: 'weak must be below good' }),
    networkmapHours: z.number().min(1).max(168),
    retention: z.object({
      samplesDays: z.number().int().min(2).max(90),
      hourlyDays: z.number().int().min(30).max(3650),
    }),
    rules: z.object({
      offline: rule({
        minutes: z
          .number()
          .int()
          .min(5)
          .max(24 * 60),
      }),
      signal: rule({
        minutes: z
          .number()
          .int()
          .min(30)
          .max(24 * 60),
      }),
      trend: rule({}),
      topology: rule({}),
      network: rule({}),
      pattern: rule({}),
    }),
    channels: z.object({
      ntfy: z.object({
        server: z.url().or(z.literal('')),
        topic: z.string().max(200),
        token: z.string().max(500),
      }),
      webhook: z.object({ url: z.url().or(z.literal('')) }),
      mqtt: z.object({ enabled: z.boolean(), topic: z.string().min(1).max(200) }),
    }),
  })
  .strict()

export type Settings = z.infer<typeof settingsSchema>

export const DEFAULT_SETTINGS: Settings = {
  thresholds: { good: 60, weak: 25 },
  networkmapHours: 6,
  retention: { samplesDays: 14, hourlyDays: 365 },
  rules: {
    offline: { enabled: true, minutes: 60 },
    signal: { enabled: true, minutes: 30 },
    trend: { enabled: true },
    topology: { enabled: false },
    network: { enabled: true },
    pattern: { enabled: true },
  },
  channels: {
    ntfy: { server: 'https://ntfy.sh', topic: '', token: '' },
    webhook: { url: '' },
    mqtt: { enabled: false, topic: 'funkloch/events' },
  },
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/** Deep merge of stored values over the defaults; keys the defaults do not know are dropped. */
const mergeOver = (defaults: unknown, stored: unknown): unknown => {
  if (!isObject(defaults)) return stored === undefined ? defaults : stored
  const source = isObject(stored) ? stored : {}
  return Object.fromEntries(
    Object.entries(defaults).map(([key, value]) => [key, mergeOver(value, source[key])]),
  )
}

/** Stored settings, completed with the defaults; anything invalid falls back to the defaults. */
export const resolveSettings = (
  stored: unknown,
  defaults: Settings = DEFAULT_SETTINGS,
): Settings => {
  const result = settingsSchema.safeParse(mergeOver(defaults, stored))
  return result.success ? result.data : defaults
}
