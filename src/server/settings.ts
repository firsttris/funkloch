import '@tanstack/react-start/server-only'
import type { Config } from '~/config'
import { DEFAULT_SETTINGS, resolveSettings, type Settings, settingsSchema } from '~/core/settings'
import type { Db } from '~/db/client'
import { getSetting, setSetting } from '~/db/store'

const KEY = 'config'

/** Defaults with what the environment says, e.g. the network map interval */
export const defaultsFrom = (config: Pick<Config, 'ZIGBEE2MQTT_NETWORKMAP_HOURS'>): Settings => ({
  ...DEFAULT_SETTINGS,
  networkmapHours: config.ZIGBEE2MQTT_NETWORKMAP_HOURS,
})

export const loadSettings = (db: Db, defaults: Settings = DEFAULT_SETTINGS) =>
  resolveSettings(getSetting(db, KEY), defaults)

/** Validates and stores; returns the error message instead of throwing */
export const saveSettings = (db: Db, input: unknown) => {
  const result = settingsSchema.safeParse(input)
  if (!result.success)
    return { ok: false as const, error: result.error.issues[0]?.message ?? 'invalid' }
  setSetting(db, KEY, result.data)
  return { ok: true as const, settings: result.data }
}
