import { describe, expect, test } from 'vitest'
import { offlineMinutes, reachability, silenceLimit, typicalInterval } from './reachability'
import { HOUR, MINUTE } from './types'

describe('typicalInterval', () => {
  test('is the gap a moment typically falls into', () => {
    expect(typicalInterval([0, 10, 20, 30, 40].map((m) => m * MINUTE))).toBe(10 * MINUTE)
    // 10 + 10 minutes against 30: most of the time lies in the long gap
    expect(typicalInterval([0, 10, 20, 50].map((m) => m * MINUTE))).toBe(30 * MINUTE)
  })

  test('a remote that sends bursts keeps the long gaps between them', () => {
    const presses = (day: number) => [0, 1, 2, 3].map((s) => day * 24 * HOUR + 20 * HOUR + s * 1000)
    const week = [0, 1, 2, 3, 4, 5, 6].flatMap(presses)
    expect(typicalInterval(week)).toBeGreaterThan(20 * HOUR)
  })

  test('a short outage does not move a regular interval', () => {
    const regular = Array.from({ length: 200 }, (_, i) => i * 50 * MINUTE)
    const withOutage = regular.filter((ts) => ts < 50 * HOUR || ts > 56 * HOUR)
    expect(typicalInterval(withOutage)).toBe(50 * MINUTE)
  })

  test('needs three messages', () => {
    expect(typicalInterval([0, MINUTE])).toBeNull()
  })

  test('ignores duplicate timestamps and order', () => {
    expect(typicalInterval([20, 0, 10, 10].map((m) => m * MINUTE))).toBe(10 * MINUTE)
  })
})

describe('silenceLimit', () => {
  test('is three intervals, at least 30 min', () => {
    expect(silenceLimit(50 * MINUTE)).toBe(150 * MINUTE)
    expect(silenceLimit(MINUTE)).toBe(30 * MINUTE)
    expect(silenceLimit(null)).toBeNull()
  })
})

describe('reachability', () => {
  const now = 100 * HOUR

  test('the protocol saying offline wins', () => {
    expect(reachability({ reported: false, lastSeen: now, interval: MINUTE, now })).toEqual({
      online: false,
      reason: 'reported',
    })
  })

  test('a device silent for longer than the limit is offline, even if reported online', () => {
    const lastSeen = now - 31 * MINUTE
    expect(reachability({ reported: true, lastSeen, interval: MINUTE, now }).online).toBe(false)
    expect(reachability({ reported: null, lastSeen, interval: MINUTE, now }).reason).toBe('silent')
  })

  test('a device within its limit is online', () => {
    const lastSeen = now - 2 * HOUR
    expect(reachability({ reported: null, lastSeen, interval: HOUR, now })).toEqual({
      online: true,
      reason: 'seen',
    })
  })

  test('without history only the report counts', () => {
    const lastSeen = now - 48 * HOUR
    expect(reachability({ reported: null, lastSeen, interval: null, now }).online).toBe(true)
    expect(reachability({ reported: null, lastSeen: null, interval: null, now }).reason).toBe(
      'unknown',
    )
  })
})

describe('offlineMinutes', () => {
  const start = 10 * HOUR
  const end = start + HOUR

  test('counts the offline stretches inside the hour', () => {
    const changes = [
      { ts: start + 10 * MINUTE, online: false },
      { ts: start + 25 * MINUTE, online: true },
      { ts: start + 50 * MINUTE, online: false },
    ]
    expect(offlineMinutes(changes, true, start, end)).toBe(25)
  })

  test('an hour that starts offline counts until it comes back', () => {
    expect(offlineMinutes([{ ts: start + 20 * MINUTE, online: true }], false, start, end)).toBe(20)
    expect(offlineMinutes([], false, start, end)).toBe(60)
    expect(offlineMinutes([], true, start, end)).toBe(0)
  })

  test('ignores changes outside the hour', () => {
    expect(offlineMinutes([{ ts: end + MINUTE, online: false }], true, start, end)).toBe(0)
  })
})
