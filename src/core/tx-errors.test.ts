import fc from 'fast-check'
import { describe, expect, test } from 'vitest'
import { counterDeltas, hourlyTxErrorRates, txErrorRate, txErrorTransition } from './tx-errors'
import { HOUR } from './types'

const reading = (ts: number, unicast: number, broadcast: number, errors: number) => ({
  ts,
  unicast,
  broadcast,
  errors,
})

describe('counterDeltas', () => {
  test('frames are unicast plus broadcast, between consecutive readings', () => {
    expect(counterDeltas([reading(0, 100, 50, 3), reading(300, 160, 70, 9)])).toEqual([
      { ts: 300, frames: 80, errors: 6 },
    ])
  })

  test('a counter that went down is a restart: the new values count from zero', () => {
    const deltas = counterDeltas([
      reading(0, 9000, 4000, 900),
      reading(300, 9100, 4050, 910),
      reading(600, 40, 20, 2),
    ])
    expect(deltas).toEqual([
      { ts: 300, frames: 150, errors: 10 },
      { ts: 600, frames: 60, errors: 2 },
    ])
  })

  test('readings out of order are sorted first', () => {
    expect(counterDeltas([reading(600, 30, 0, 3), reading(0, 10, 0, 1)])).toEqual([
      { ts: 600, frames: 20, errors: 2 },
    ])
  })

  test('never negative, whatever the counters do', () => {
    const counter = fc.integer({ min: 0, max: 1_000_000 })
    fc.assert(
      fc.property(fc.array(fc.tuple(counter, counter, counter), { maxLength: 30 }), (values) => {
        const deltas = counterDeltas(values.map(([u, b, e], i) => reading(i, u, b, e)))
        return deltas.every((d) => d.frames >= 0 && d.errors >= 0)
      }),
    )
  })
})

describe('txErrorRate', () => {
  // The Thread router in the cellar: 1326 failures of about 13,700 frames
  const measured = [reading(0, 0, 0, 0), reading(HOUR, 9_700, 4_000, 1_326)]

  test('errors over frames in the window', () => {
    const rate = txErrorRate(counterDeltas(measured), 0)
    expect(rate?.frames).toBe(13_700)
    expect(rate?.rate).toBeCloseTo(0.0968, 3)
  })

  test('deltas at or before the start of the window do not count', () => {
    expect(txErrorRate(counterDeltas(measured), HOUR)).toBeNull()
  })

  test('too few frames give no rate', () => {
    expect(txErrorRate([{ ts: 1, frames: 20, errors: 3 }], 0)).toBeNull()
  })
})

describe('hourlyTxErrorRates', () => {
  test('one percentage per hour, null for an hour that sent too little', () => {
    const deltas = [
      { ts: 10 * 60_000, frames: 100, errors: 5 },
      { ts: 40 * 60_000, frames: 100, errors: 15 },
      { ts: HOUR + 60_000, frames: 5, errors: 1 },
      { ts: 2 * HOUR + 60_000, frames: 400, errors: 0 },
    ]
    expect(hourlyTxErrorRates(deltas, 0, 2 * HOUR + 30 * 60_000)).toEqual([10, null, 0])
  })

  test('deltas before the first hour are left out', () => {
    expect(hourlyTxErrorRates([{ ts: -HOUR, frames: 100, errors: 100 }], 0, HOUR - 1)).toEqual([
      null,
    ])
  })
})

describe('txErrorTransition', () => {
  const rate = (value: number) => ({ rate: value, frames: 1000, errors: value * 1000 })

  test('marked from 5 % on, unmarked below 3 %', () => {
    expect(txErrorTransition(false, rate(0.05))).toBe('tx_errors_high')
    expect(txErrorTransition(false, rate(0.049))).toBeNull()
    expect(txErrorTransition(true, rate(0.04))).toBeNull()
    expect(txErrorTransition(true, rate(0.029))).toBe('tx_errors_normal')
  })

  test('no rate, no change', () => {
    expect(txErrorTransition(true, null)).toBeNull()
    expect(txErrorTransition(false, null)).toBeNull()
  })
})
