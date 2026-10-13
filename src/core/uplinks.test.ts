import fc from 'fast-check'
import { describe, expect, test } from 'vitest'
import type { Link } from './types'
import { withUplinks } from './uplinks'

const link = (from: string, to: string, lqi: number | null, parent = false): Link => ({
  from,
  to,
  lqi,
  rssi: null,
  parent,
})
const byLqi = (l: Link) => l.lqi
const parents = (links: Link[]) =>
  links
    .filter((l) => l.parent)
    .map((l) => `${l.from}>${l.to}`)
    .sort()

describe('withUplinks', () => {
  test('a router takes the best neighbor one hop closer to the root', () => {
    // c is the coordinator; r1 and r2 hear it, r3 hears both routers but not c
    const links = [
      link('r1', 'c', 200),
      link('r2', 'c', 120),
      link('r3', 'r1', 60),
      link('r3', 'r2', 180),
      link('r1', 'r2', 250),
    ]
    expect(parents(withUplinks(links, new Set(['c']), byLqi))).toEqual(['r1>c', 'r2>c', 'r3>r2'])
  })

  test('an existing parent stays, the root gets none', () => {
    const links = [link('e', 'r', 90, true), link('r', 'c', 200), link('e', 'c', 250)]
    expect(parents(withUplinks(links, new Set(['c']), byLqi))).toEqual(['e>r', 'r>c'])
  })

  test('when only the uplink heard the pair, the child direction is added with its values', () => {
    const result = withUplinks([link('c', 'r', 140)], new Set(['c']), byLqi)
    expect(result).toContainEqual(link('r', 'c', 140, true))
    expect(result).toContainEqual(link('c', 'r', 140))
  })

  test('without a path to a root nothing changes', () => {
    const links = [link('a', 'b', 100)]
    expect(withUplinks(links, new Set(['c']), byLqi)).toEqual(links)
  })

  test('the uplinks never form a cycle', () => {
    const names = ['c', 'a', 'b', 'd', 'e', 'f']
    const arbitraryLink = fc
      .tuple(fc.constantFrom(...names), fc.constantFrom(...names), fc.integer({ min: 0, max: 255 }))
      .map(([from, to, lqi]) => link(from, to, lqi))
    fc.assert(
      fc.property(fc.array(arbitraryLink, { maxLength: 20 }), (links) => {
        const result = withUplinks(links, new Set(['c']), byLqi)
        const up = new Map(result.filter((l) => l.parent).map((l) => [l.from, l.to]))
        for (const start of up.keys()) {
          const seen = new Set<string>()
          let current: string | undefined = start
          while (current !== undefined && current !== 'c') {
            if (seen.has(current)) return false
            seen.add(current)
            current = up.get(current)
          }
        }
        return true
      }),
    )
  })
})
