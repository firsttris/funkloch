import { linearScore } from '~/core/score'
import type { ProtocolMeta } from '../types'

export const THREAD_RSSI_MIN = -100
export const THREAD_RSSI_MAX = -50

/** Highest score each Thread link quality (0–3) allows */
const LQI_CAP: Record<number, number> = { 0: 0, 1: 24, 2: 59, 3: 100 }

/**
 * Thread: RSSI linear between −100 dBm (0) and −50 dBm (100), capped by the link quality.
 * A starting point from the plan, to be calibrated against real data in phase 2.
 */
export const threadScore = (rssi: number, lqi: number) =>
  Math.min(linearScore(rssi, THREAD_RSSI_MIN, THREAD_RSSI_MAX), LQI_CAP[lqi] ?? 0)

export const threadMeta: ProtocolMeta = {
  id: 'thread',
  label: 'Thread',
  raw: { label: 'RSSI', min: -110, max: -30, unit: 'dBm' },
  rawAtScore: null,
  formatRaw: ({ lqi, rssi }) =>
    [lqi === null ? null : `LQI ${lqi}`, rssi === null ? null : `${rssi} dBm`.replace('-', '−')]
      .filter(Boolean)
      .join(' · '),
  linkScore: ({ lqi, rssi }) => (lqi === null || rssi === null ? null : threadScore(rssi, lqi)),
  formatLink: ({ lqi, rssi }) =>
    [lqi === null ? '–' : String(lqi), rssi === null ? null : String(rssi).replace('-', '−')]
      .filter(Boolean)
      .join(' · '),
  // The RSSI where both directions have one, else the link quality 0–3 of older images
  formatLinkPair: (there, back) => {
    const rssi = [there?.rssi, back?.rssi].flatMap((v) => (v == null ? [] : [v]))
    if (rssi.length > 0) return `${rssi.join('/')} dBm`.replaceAll('-', '−')
    const lqi = [there?.lqi, back?.lqi].flatMap((v) => (v == null ? [] : [v]))
    return lqi.length === 0 ? '–' : `LQI ${lqi.join('/')}`
  },
}
