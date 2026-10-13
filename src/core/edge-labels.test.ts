import { describe, expect, test } from 'vitest'
import { placeEdgeLabels } from './edge-labels'
import type { MapNode } from './topology'

const node = (id: number, name: string): MapNode => ({
  id,
  name,
  role: 'end_device',
  status: 'good',
})

describe('placeEdgeLabels', () => {
  test('a value sits in the middle of its line when that spot is free', () => {
    const spots = placeEdgeLabels(
      [node(1, 'A'), node(2, 'B')],
      [
        { id: 1, x: 0, y: 0 },
        { id: 2, x: 400, y: 0 },
      ],
      [{ a: 1, b: 2, text: '120' }],
    )
    expect(spots.get('1-2')).toEqual({ x: 200, y: 0 })
  })

  test('a value moves along its line off a name in the middle', () => {
    const spots = placeEdgeLabels(
      [node(1, 'A'), node(2, 'B'), node(3, 'Ein ziemlich langer Name im Weg')],
      [
        { id: 1, x: 0, y: 0 },
        { id: 2, x: 400, y: 0 },
        { id: 3, x: 200, y: -30 },
      ],
      [{ a: 1, b: 2, text: '120' }],
    )
    expect(spots.get('1-2')?.x).not.toBe(200)
    expect(spots.get('1-2')?.y).toBe(0)
  })

  test('two values on crossing lines do not take the same spot', () => {
    const spots = placeEdgeLabels(
      [node(1, 'A'), node(2, 'B'), node(3, 'C'), node(4, 'D')],
      [
        { id: 1, x: 0, y: 0 },
        { id: 2, x: 400, y: 400 },
        { id: 3, x: 400, y: 0 },
        { id: 4, x: 0, y: 400 },
      ],
      [
        { a: 1, b: 2, text: '120' },
        { a: 3, b: 4, text: '80' },
      ],
    )
    expect(spots.get('1-2')).not.toEqual(spots.get('3-4'))
  })
})
