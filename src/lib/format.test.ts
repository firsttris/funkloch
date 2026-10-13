import { afterEach, describe, expect, test } from 'vitest'
import { dateFormat, dateTime, dayKey } from './format'
import { setTimeZone } from './time-zone'

// 2026-10-13 22:30 UTC: still the 13th in New York, already the 14th in Berlin
const LATE = Date.UTC(2026, 9, 13, 22, 30)

describe('dates in the server time zone', () => {
  afterEach(() => setTimeZone('UTC'))

  test('the day and hour follow the zone the server sent, not the runtime', () => {
    setTimeZone('Europe/Berlin')
    expect(dayKey(LATE)).toBe('2026-10-14')
    expect(dateFormat({ hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(LATE)).toBe(
      '00:30',
    )
    setTimeZone('America/New_York')
    expect(dayKey(LATE)).toBe('2026-10-13')
    expect(dateTime(LATE)).toContain('18:30')
  })
})
