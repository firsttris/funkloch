import { describe, expect, test } from 'vitest'
import { changes, staleKeys } from './live'

const base = { sample: 1, event: 1, snapshot: 1, device: 1 }

describe('changes', () => {
  test('null when nothing changed', () => {
    expect(changes(base, { ...base })).toBeNull()
  })

  test('names what changed', () => {
    expect(changes(base, { ...base, sample: 2, snapshot: 3 })).toEqual({
      samples: true,
      events: false,
      topology: true,
      devices: false,
    })
  })
})

describe('staleKeys', () => {
  test('maps changes to query keys', () => {
    expect(staleKeys({ samples: true, events: false, topology: false, devices: false })).toEqual([
      'overview',
      'device',
    ])
    expect(staleKeys({ samples: false, events: true, topology: true, devices: false })).toEqual([
      'events',
      'device',
      'heatmap',
      'network',
      'device',
    ])
  })
})
