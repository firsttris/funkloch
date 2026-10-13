import { describe, expect, test } from 'vitest'
import { FIRST_MAP_AFTER, networkmapDue } from './adapter'

const HOUR = 3_600_000

describe('networkmapDue', () => {
  test('the first map comes a few minutes after start', () => {
    expect(networkmapDue(null, 0, FIRST_MAP_AFTER - 1, 6)).toBe(false)
    expect(networkmapDue(null, 0, FIRST_MAP_AFTER, 6)).toBe(true)
  })

  test('then every configured interval, never more often than hourly', () => {
    expect(networkmapDue(0, 0, 6 * HOUR - 1, 6)).toBe(false)
    expect(networkmapDue(0, 0, 6 * HOUR, 6)).toBe(true)
    expect(networkmapDue(0, 0, 30 * 60_000, 0.1)).toBe(false)
    expect(networkmapDue(0, 0, HOUR, 0.1)).toBe(true)
  })
})
