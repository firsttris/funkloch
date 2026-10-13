import { afterEach, describe, expect, test } from 'vitest'
import { DEFAULT_SETTINGS } from '~/core/settings'
import { tempDb } from '~/db/test-db'
import { defaultsFrom, loadSettings, saveSettings } from './settings'

let cleanup = () => {}
afterEach(() => cleanup())

describe('settings', () => {
  test('saved settings come back, invalid ones are refused with a reason', () => {
    const t = tempDb()
    cleanup = t.cleanup
    expect(loadSettings(t.db)).toEqual(DEFAULT_SETTINGS)
    const changed = { ...DEFAULT_SETTINGS, thresholds: { good: 70, weak: 30 } }
    expect(saveSettings(t.db, changed)).toEqual({ ok: true, settings: changed })
    expect(loadSettings(t.db).thresholds).toEqual({ good: 70, weak: 30 })

    const broken = {
      ...DEFAULT_SETTINGS,
      channels: { ...DEFAULT_SETTINGS.channels, webhook: { url: 'not a url' } },
    }
    const result = saveSettings(t.db, broken)
    expect(result.ok).toBe(false)
    expect(loadSettings(t.db).thresholds).toEqual({ good: 70, weak: 30 })
    expect(saveSettings(t.db, { nonsense: true }).ok).toBe(false)
  })

  test('the network map interval from the environment is the default', () => {
    const t = tempDb()
    cleanup = t.cleanup
    expect(
      loadSettings(t.db, defaultsFrom({ ZIGBEE2MQTT_NETWORKMAP_HOURS: 12 })).networkmapHours,
    ).toBe(12)
  })
})
