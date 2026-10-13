import { describe, expect, test } from 'vitest'
import { parsePayload, REDACTED, redact, redactBody } from './redact'

describe('redact', () => {
  test('replaces secrets at any depth and keeps the rest', () => {
    const info = {
      version: '2.14.2',
      config: {
        mqtt: { server: 'mqtt://localhost', password: 'hunter2' },
        advanced: { network_key: [1, 2, 3], pan_id: 6754 },
      },
      list: [{ NetworkKey: 'abc', Channel: 15 }],
    }
    expect(redact(info)).toEqual({
      version: '2.14.2',
      config: {
        mqtt: { server: 'mqtt://localhost', password: REDACTED },
        advanced: { network_key: REDACTED, pan_id: 6754 },
      },
      list: [{ NetworkKey: REDACTED, Channel: 15 }],
    })
  })

  test('leaves primitives alone', () => {
    expect(redact('online')).toBe('online')
    expect(redact(42)).toBe(42)
    expect(redact(null)).toBeNull()
  })

  test('drops a dataset in TLV hex form', () => {
    expect(redactBody('/node/dataset/active', '0e08000000')).toBe(REDACTED)
    expect(redactBody('/node/state', 'leader')).toBe('leader')
  })
})

describe('parsePayload', () => {
  test('parses JSON and keeps plain strings', () => {
    expect(parsePayload('{"linkquality":120}')).toEqual({ linkquality: 120 })
    expect(parsePayload('online')).toBe('online')
  })
})
