import { describe, expect, test } from 'vitest'
import { extAddress, macAddress, octetText, parseWire, stringifyWire } from './wire'

describe('parseWire', () => {
  test('keeps every digit of an integer beyond 2^53', () => {
    const parsed = parseWire('{"a":12249790986447749121,"b":42,"c":1.5,"d":"12249790986447749121"}')
    expect(parsed).toEqual({ a: 12249790986447749121n, b: 42, c: 1.5, d: '12249790986447749121' })
  })

  test('writes bigint back as an unquoted number', () => {
    expect(stringifyWire({ node_id: 18446744073709551615n, path: ['0/53/7'] })).toBe(
      '{"node_id":18446744073709551615,"path":["0/53/7"]}',
    )
  })
})

describe('addresses', () => {
  test('an extended address from a uint64 or from base64, as 16 hex digits', () => {
    expect(extAddress(12249790986447749121n)).toBe('aa00000000000001')
    expect(extAddress(5)).toBe('0000000000000005')
    expect(extAddress('ERERERERERE=')).toBe('1111111111111111')
    expect(extAddress(0)).toBeNull()
    expect(extAddress('AAAAAAAAAAA=')).toBeNull()
    expect(extAddress('not base64!')).toBeNull()
  })

  test('a MAC address from 6 bytes of base64', () => {
    expect(macAddress('qrvMABEi')).toBe('aa:bb:cc:00:11:22')
    expect(macAddress('ERERERERERE=')).toBeNull()
  })

  test('an SSID only when it is readable text', () => {
    expect(octetText('SGVpbW5ldHo=')).toBe('Heimnetz')
    expect(octetText('AAEC')).toBeNull()
  })
})
