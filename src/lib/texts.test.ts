import { describe, expect, test } from 'vitest'
import type { RouterFinding } from '~/core/router-finding'
import { eventDetail, findingSentences } from './texts'

const sockets = ['Steckdose Keller Flur', 'Steckdose Keller Kleiner Raum', 'Steckdose Keller Sauna']

/** The ESP32-C6 router in the cellar, as core/router-finding.ts sees it */
const esp: RouterFinding & { uplink: { text: string } } = {
  children: 0,
  carried: 0,
  uplink: {
    id: 1,
    name: 'Coordinator',
    root: true,
    there: { lqi: 15, rssi: null },
    back: { lqi: 64, rssi: null },
    score: 6,
    weak: true,
    text: 'LQI 64/15',
  },
  root: { name: 'Coordinator', role: 'coordinator' },
  neighbors: 3,
  coveredBy: sockets.map((name, i) => ({ id: i + 3, name, neighbor: true })),
  advice: 'move_towards_root',
}

describe('findingSentences', () => {
  test('the unused router in the cellar, in German and English', () => {
    expect(findingSentences(esp, 'de').join(' ')).toBe(
      'Kein Gerät nutzt diesen Router. Seine Nachbarn Steckdose Keller Flur, Steckdose Keller ' +
        'Kleiner Raum und Steckdose Keller Sauna decken den Bereich schon ab. Sein Weg zum ' +
        'Koordinator ist schwach (LQI 64/15). An einer Stelle zwischen diesem Bereich und dem ' +
        'Koordinator würde er mehr bringen.',
    )
    expect(findingSentences(esp, 'en').join(' ')).toBe(
      'No device uses this router. Its neighbors Steckdose Keller Flur, Steckdose Keller Kleiner ' +
        'Raum, and Steckdose Keller Sauna already cover the area. Its way to the coordinator is ' +
        'weak (LQI 64/15). Placed somewhere between this area and the coordinator, it would do more.',
    )
  })

  test('a Thread router that carries devices through another router', () => {
    const carrying = {
      ...esp,
      children: 2,
      carried: 5,
      coveredBy: [],
      uplink: {
        ...esp.uplink,
        root: false,
        name: 'Thermostat Büro',
        weak: false,
        text: '−70/−72 dBm',
      },
      root: { name: 'otbr', role: 'border_router' as const },
      advice: null,
    }
    expect(findingSentences(carrying, 'de')).toEqual([
      '5 Geräte gehen über diesen Router zum Border Router, 2 davon direkt.',
      'Sein Weg zum Border Router ist in Ordnung (−70/−72 dBm zu Thermostat Büro).',
    ])
  })

  test('covering routers that are not its neighbors are named as such, one or more', () => {
    const lamp = { id: 9, name: 'Lampe Keller', neighbor: false }
    expect(findingSentences({ ...esp, coveredBy: [lamp] }, 'de')[1]).toBe(
      'Lampe Keller hört seine Nachbarn mindestens genauso gut und deckt den Bereich schon ab.',
    )
    const two = [lamp, { id: 10, name: 'Steckdose Keller Flur', neighbor: true }]
    expect(findingSentences({ ...esp, coveredBy: two }, 'en')[1]).toBe(
      'Lampe Keller and Steckdose Keller Flur hear its neighbors at least as well and already ' +
        'cover the area.',
    )
    const neighbor = [{ id: 10, name: 'Steckdose Keller Flur', neighbor: true }]
    expect(findingSentences({ ...esp, coveredBy: neighbor }, 'de')[1]).toBe(
      'Sein Nachbar Steckdose Keller Flur deckt den Bereich schon ab.',
    )
  })
})

describe('eventDetail', () => {
  test('transmit errors with the numbers in the language of the text', () => {
    const event = {
      kind: 'signal',
      type: 'tx_errors_high',
      details: { rate: 9.7, errors: 1326, frames: 13_700, threshold: 5 },
    }
    expect(eventDetail(event, 'de')).toBe('9,7 % von 13.700 Frames in 24 h (Schwelle 5 %)')
    expect(eventDetail(event, 'en')).toBe('9.7 % of 13,700 frames in 24 h (threshold 5 %)')
  })
})
