import { linearScore, scoreToRaw } from '~/core/score'
import type { ProtocolMeta } from '../types'

export const ZIGBEE_LQI_MAX = 255

/** Zigbee: score = LQI / 255 × 100 */
export const zigbeeScore = (lqi: number) => linearScore(lqi, 0, ZIGBEE_LQI_MAX)

export const zigbeeMeta: ProtocolMeta = {
  id: 'zigbee',
  label: 'Zigbee',
  raw: { label: 'LQI', min: 0, max: ZIGBEE_LQI_MAX, unit: '' },
  rawAtScore: (score) => Math.round(scoreToRaw(score, 0, ZIGBEE_LQI_MAX)),
  formatRaw: ({ raw }) => `LQI ${Math.round(raw)}`,
  linkScore: ({ lqi }) => (lqi === null ? null : zigbeeScore(lqi)),
  formatLink: ({ lqi }) => (lqi === null ? '–' : String(Math.round(lqi))),
}
