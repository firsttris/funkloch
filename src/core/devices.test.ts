import { describe, expect, test } from 'vitest'
import { deviceStatus, diffDevices, parentOf } from './devices'
import type { DeviceInfo } from './types'

const device = (address: string, name = address): DeviceInfo => ({
  protocol: 'zigbee',
  address,
  name,
  role: 'router',
  model: null,
  vendor: null,
  power: 'mains',
  networkAddress: null,
})

describe('diffDevices', () => {
  test('finds new, removed and changed devices', () => {
    const known = [device('a'), device('b'), device('c')]
    const incoming = [device('a'), device('b', 'Lampe'), device('d')]
    expect(diffDevices(known, incoming)).toEqual({
      added: [device('d')],
      changed: [device('b', 'Lampe')],
      removed: ['c'],
    })
  })
})

describe('deviceStatus', () => {
  test('offline wins over the score', () => {
    expect(deviceStatus(false, 90)).toBe('offline')
  })

  test('uses the band of the score', () => {
    expect(deviceStatus(true, 90)).toBe('good')
    expect(deviceStatus(true, 10)).toBe('weak')
    expect(deviceStatus(true, null)).toBe('unknown')
  })
})

describe('parentOf', () => {
  test('returns the parent from the links', () => {
    const links = [
      { from: 'a', to: 'b', parent: false },
      { from: 'a', to: 'c', parent: true },
    ]
    expect(parentOf('a', links)).toBe('c')
    expect(parentOf('b', links)).toBeNull()
  })
})
