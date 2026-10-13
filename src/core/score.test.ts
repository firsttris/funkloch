import fc from 'fast-check'
import { describe, expect, test } from 'vitest'
import { band, linearScore, scoreToRaw } from './score'

describe('linearScore', () => {
  test('maps the range ends to 0 and 100', () => {
    expect(linearScore(0, 0, 255)).toBe(0)
    expect(linearScore(255, 0, 255)).toBe(100)
    expect(linearScore(-100, -100, -50)).toBe(0)
    expect(linearScore(-50, -100, -50)).toBe(100)
  })

  test('is linear in between and rounds', () => {
    expect(linearScore(128, 0, 255)).toBe(50)
    expect(linearScore(-75, -100, -50)).toBe(50)
  })

  test('is always 0 to 100', () => {
    fc.assert(
      fc.property(fc.double({ noNaN: true, min: -1e6, max: 1e6 }), (value) => {
        const score = linearScore(value, 0, 255)
        return score >= 0 && score <= 100
      }),
    )
  })

  test('scoreToRaw undoes it', () => {
    expect(scoreToRaw(25, 0, 255)).toBeCloseTo(63.75)
    expect(scoreToRaw(100, -100, -50)).toBe(-50)
  })
})

describe('band', () => {
  test('uses 60 and 25 as defaults', () => {
    expect(band(60)).toBe('good')
    expect(band(59)).toBe('mid')
    expect(band(25)).toBe('mid')
    expect(band(24)).toBe('weak')
  })

  test('takes other thresholds', () => {
    expect(band(50, { good: 50, weak: 10 })).toBe('good')
    expect(band(9, { good: 50, weak: 10 })).toBe('weak')
  })
})
