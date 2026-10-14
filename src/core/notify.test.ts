import { describe, expect, test } from 'vitest'
import { decide, type History, hasChannel } from './notify'
import { DEFAULT_SETTINGS } from './settings'
import { HOUR, MINUTE } from './types'

const rules = DEFAULT_SETTINGS.rules
const now = 1000 * HOUR
const none: History = {
  lastSent: new Map(),
  offlineSent: new Set(),
  weakSent: new Set(),
  txErrorsSent: new Set(),
}
const event = (type: string, ago: number, deviceOnline: boolean | null = false) => ({
  id: 1,
  ts: now - ago,
  type,
  deviceId: 7,
  deviceOnline,
})

describe('decide', () => {
  test('offline waits for the configured time, then sends if still offline', () => {
    expect(decide(event('offline', 10 * MINUTE), rules, none, now)).toBe('wait')
    expect(decide(event('offline', 61 * MINUTE), rules, none, now)).toBe('send')
  })

  test('offline is skipped when the device came back in the meantime', () => {
    expect(decide(event('offline', 10 * MINUTE, true), rules, none, now)).toBe('skip')
  })

  test('online and recovered only follow a sent offline or weak message', () => {
    expect(decide(event('online', MINUTE, true), rules, none, now)).toBe('skip')
    const sent = { ...none, offlineSent: new Set([7]), weakSent: new Set([7]) }
    expect(decide(event('online', MINUTE, true), rules, sent, now)).toBe('send')
    expect(decide(event('signal_recovered', MINUTE), rules, none, now)).toBe('skip')
    expect(decide(event('signal_recovered', MINUTE), rules, sent, now)).toBe('send')
  })

  test('transmit errors back to normal only follow a sent warning', () => {
    expect(decide(event('tx_errors_high', MINUTE), rules, none, now)).toBe('send')
    expect(decide(event('tx_errors_normal', MINUTE), rules, none, now)).toBe('skip')
    const sent = { ...none, txErrorsSent: new Set([7]) }
    expect(decide(event('tx_errors_normal', MINUTE), rules, sent, now)).toBe('send')
    const off = { ...rules, transmit: { enabled: false } }
    expect(decide(event('tx_errors_high', MINUTE), off, none, now)).toBe('skip')
  })

  test('a rule that is off skips its events', () => {
    expect(decide(event('parent_changed', MINUTE), rules, none, now)).toBe('skip')
    const on = { ...rules, topology: { enabled: true } }
    expect(decide(event('parent_changed', MINUTE), on, none, now)).toBe('send')
    const off = { ...rules, signal: { enabled: false, minutes: 30 } }
    expect(decide(event('signal_weak', MINUTE), off, none, now)).toBe('skip')
  })

  test('the same event of the same device at most once an hour', () => {
    const recent = { ...none, lastSent: new Map([['signal_weak:7', now - 30 * MINUTE]]) }
    expect(decide(event('signal_weak', MINUTE), rules, recent, now)).toBe('skip')
    const old = { ...none, lastSent: new Map([['signal_weak:7', now - 2 * HOUR]]) }
    expect(decide(event('signal_weak', MINUTE), rules, old, now)).toBe('send')
  })

  test('old and unknown events are skipped', () => {
    expect(decide(event('trend_down', 7 * HOUR), rules, none, now)).toBe('skip')
    expect(decide(event('something_new', MINUTE), rules, none, now)).toBe('skip')
  })

  test('a long offline wait still sends', () => {
    const long = { ...rules, offline: { enabled: true, minutes: 8 * 60 } }
    expect(decide(event('offline', 8 * HOUR + MINUTE), long, none, now)).toBe('send')
  })
})

describe('hasChannel', () => {
  test('needs a full ntfy target, a webhook or MQTT', () => {
    expect(hasChannel(DEFAULT_SETTINGS.channels)).toBe(false)
    expect(
      hasChannel({
        ...DEFAULT_SETTINGS.channels,
        ntfy: { server: 'https://ntfy.sh', topic: 'x', token: '' },
      }),
    ).toBe(true)
    expect(hasChannel({ ...DEFAULT_SETTINGS.channels, webhook: { url: 'http://x' } })).toBe(true)
    expect(hasChannel({ ...DEFAULT_SETTINGS.channels, mqtt: { enabled: true, topic: 't' } })).toBe(
      true,
    )
  })
})
