import { describe, expect, test } from 'vitest'
import { parentChangesBetween, signalTransition, trendTransition } from './events'

const thresholds = { good: 60, weak: 25 }

describe('signalTransition', () => {
  test('a median below the weak threshold turns the signal weak once', () => {
    expect(signalTransition(false, [10, 20, 40], thresholds)).toBe('signal_weak')
    expect(signalTransition(true, [10, 20, 40], thresholds)).toBeNull()
  })

  test('a single low reading among good ones changes nothing', () => {
    expect(signalTransition(false, [5, 50, 55], thresholds)).toBeNull()
  })

  test('recovery needs the threshold plus hysteresis', () => {
    expect(signalTransition(true, [27, 28], thresholds)).toBeNull()
    expect(signalTransition(true, [30, 31], thresholds)).toBe('signal_recovered')
  })

  test('no samples, no change', () => {
    expect(signalTransition(false, [], thresholds)).toBeNull()
    expect(signalTransition(true, [], thresholds)).toBeNull()
  })
})

describe('trendTransition', () => {
  test('only the start of a falling trend counts', () => {
    expect(trendTransition('flat', 'down')).toBe('trend_down')
    expect(trendTransition(null, 'down')).toBe('trend_down')
    expect(trendTransition('down', 'down')).toBeNull()
    expect(trendTransition('down', 'flat')).toBeNull()
    expect(trendTransition('none', 'up')).toBeNull()
  })
})

describe('parentChangesBetween', () => {
  test('finds devices with a new parent, ignores new and missing ones', () => {
    const before = [
      { from: 1, to: 10, parent: true },
      { from: 2, to: 10, parent: true },
      { from: 3, to: 10, parent: true },
      { from: 1, to: 11, parent: false },
    ]
    const after = [
      { from: 1, to: 11, parent: true },
      { from: 2, to: 10, parent: true },
      { from: 4, to: 10, parent: true },
    ]
    expect(parentChangesBetween(before, after)).toEqual([{ device: 1, from: 10, to: 11 }])
  })
})
