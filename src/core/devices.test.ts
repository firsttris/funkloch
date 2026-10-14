import { describe, expect, test } from 'vitest'
import { deviceStatus, diffDevices, mergeDescribed, parentOf } from './devices'
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

describe('mergeDescribed', () => {
  const otbr = {
    source: 'otbr',
    info: { ...device('a', 'a2b3c4d5'), role: 'router' as const, networkAddress: '0x0400' },
    prefer: ['role', 'networkAddress'] as const,
  }
  const matter = {
    source: 'matter',
    info: {
      ...device('a', 'Eve Energy'),
      role: 'unknown' as const,
      vendor: 'Eve',
      model: 'Energy',
      networkAddress: '0x0401',
    },
    prefer: ['name', 'vendor', 'model', 'power'] as const,
  }

  test('each field comes from the adapter that knows it best', () => {
    expect(mergeDescribed([otbr, matter])).toEqual({
      ...device('a', 'Eve Energy'),
      role: 'router',
      vendor: 'Eve',
      model: 'Energy',
      networkAddress: '0x0400',
    })
  })

  test('the order the adapters answered in does not matter', () => {
    expect(mergeDescribed([matter, otbr])).toEqual(mergeDescribed([otbr, matter]))
  })

  test('a field nobody prefers comes from whoever knows it', () => {
    const quiet = { ...otbr, info: { ...otbr.info, networkAddress: null }, prefer: [] }
    expect(mergeDescribed([quiet, matter]).networkAddress).toBe('0x0401')
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
