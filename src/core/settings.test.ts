import { describe, expect, test } from 'vitest'
import { DEFAULT_SETTINGS, resolveSettings, settingsSchema } from './settings'

describe('resolveSettings', () => {
  test('nothing stored gives the defaults', () => {
    expect(resolveSettings(undefined)).toEqual(DEFAULT_SETTINGS)
  })

  test('stored values win, missing ones come from the defaults, unknown keys go', () => {
    const settings = resolveSettings({
      thresholds: { good: 70 },
      unknown: 1,
      rules: { trend: { enabled: false } },
    })
    expect(settings.thresholds).toEqual({ good: 70, weak: 25 })
    expect(settings.rules.trend.enabled).toBe(false)
    expect(settings.rules.offline).toEqual(DEFAULT_SETTINGS.rules.offline)
    expect(settings).not.toHaveProperty('unknown')
  })

  test('an invalid stored value falls back to the defaults', () => {
    expect(resolveSettings({ thresholds: { good: 20, weak: 30 } })).toEqual(DEFAULT_SETTINGS)
    expect(resolveSettings({ networkmapHours: 0.5 })).toEqual(DEFAULT_SETTINGS)
  })

  test('other defaults can be passed, e.g. the network map interval from the environment', () => {
    expect(resolveSettings({}, { ...DEFAULT_SETTINGS, networkmapHours: 12 }).networkmapHours).toBe(
      12,
    )
  })
})

describe('settingsSchema', () => {
  test('rejects a network map more often than hourly and a broken webhook', () => {
    expect(settingsSchema.safeParse({ ...DEFAULT_SETTINGS, networkmapHours: 0.5 }).success).toBe(
      false,
    )
    const webhook = { ...DEFAULT_SETTINGS.channels, webhook: { url: 'nope' } }
    expect(settingsSchema.safeParse({ ...DEFAULT_SETTINGS, channels: webhook }).success).toBe(false)
  })
})
