// Where the value of a parent line sits on the map. In the middle of the line it often lands on a
// device's name, so it moves along the line to the first spot that covers no device and no other
// value.
import { footprint, type Positioned } from './map-layout'
import type { MapNode } from './topology'

export const EDGE_LABEL_HEIGHT = 20

/** Width of the box around a line's value in the map's 12 px mono font */
export const edgeLabelWidth = (text: string) => Math.max(30, text.length * 7.5 + 12)

type Rect = { left: number; right: number; top: number; bottom: number }

/** The area two rectangles share; 0 when they do not touch */
const shared = (a: Rect, b: Rect) =>
  Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) *
  Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top))

/** Spots along the line, as a share of its length from `a`: the middle first, then outwards */
const SPOTS = [0.5, 0.4, 0.6, 0.3, 0.7, 0.22, 0.78]

export type EdgeLabel = { a: number; b: number; text: string }

/**
 * The centre of each line's value. Device boxes count without their margin, so a value may
 * touch a name but not cover it. Without a free spot the value takes the one it covers least.
 */
export const placeEdgeLabels = (
  nodes: readonly MapNode[],
  positions: readonly Positioned[],
  labels: readonly EdgeLabel[],
) => {
  const at = new Map(positions.map((p) => [p.id, p]))
  const taken: Rect[] = nodes.flatMap((node) => {
    const p = at.get(node.id)
    if (!p) return []
    const box = footprint(node)
    return [
      {
        left: p.x - box.half + 8,
        right: p.x + box.half - 8,
        top: p.y - box.above + 8,
        bottom: p.y + box.below - 8,
      },
    ]
  })
  const placed = new Map<string, { x: number; y: number }>()
  for (const label of labels) {
    const from = at.get(label.a)
    const to = at.get(label.b)
    if (!from || !to) continue
    const half = edgeLabelWidth(label.text) / 2
    const rectAt = (t: number) => {
      const x = from.x + (to.x - from.x) * t
      const y = from.y + (to.y - from.y) * t
      const rect = {
        left: x - half,
        right: x + half,
        top: y - EDGE_LABEL_HEIGHT / 2,
        bottom: y + EDGE_LABEL_HEIGHT / 2,
      }
      return { x: Math.round(x), y: Math.round(y), rect }
    }
    const covered = (rect: Rect) => taken.reduce((sum, other) => sum + shared(rect, other), 0)
    // The first spot that covers least: the middle wins every tie
    const spot = SPOTS.map(rectAt).reduce((best, next) =>
      covered(next.rect) < covered(best.rect) ? next : best,
    )
    taken.push(spot.rect)
    placed.set(`${label.a}-${label.b}`, { x: spot.x, y: spot.y })
  }
  return placed
}
