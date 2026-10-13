import { describe, expect, test } from 'vitest'
import { offlineMinutes, reachability, silenceLimit, typicalInterval } from './reachability'
import { HOUR, MINUTE } from './types'

describe('typicalInterval', () => {
  test('is the median gap', () => {
    expect(typicalInterval([0, 10, 20, 50].map((m) => m * MINUTE))).toBe(10 * MINUTE)
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
