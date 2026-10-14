import { linearScore, scoreToRaw } from '~/core/score'
import type { ProtocolMeta } from '../types'

export const WIFI_RSSI_MIN = -90
export const WIFI_RSSI_MAX = -50

/**
 * Wi-Fi: RSSI linear between −90 dBm (0) and −50 dBm (100). With the default thresholds a signal
 * is good from about −66 dBm and weak below −80 dBm, where a station starts to lose packets.
 */
export const wifiScore = (rssi: number) => linearScore(rssi, WIFI_RSSI_MIN, WIFI_RSSI_MAX)

const dbm = (rssi: number) => `${rssi} dBm`.replace('-', '−')

export const wifiMeta: ProtocolMeta = {
  id: 'wifi',
  label: 'Wi-Fi',
  raw: { label: 'RSSI', min: -100, max: -30, unit: 'dBm' },
  rawAtScore: (score) => Math.round(scoreToRaw(score, WIFI_RSSI_MIN, WIFI_RSSI_MAX)),
  formatRaw: ({ rssi, raw }) => dbm(rssi ?? raw),
  linkScore: ({ rssi }) => (rssi === null ? null : wifiScore(rssi)),
  formatLink: ({ rssi }) => (rssi === null ? '–' : String(rssi).replace('-', '−')),
  // Only the station measures its link to the access point
  formatLinkPair: (there, back) => {
    const rssi = there?.rssi ?? back?.rssi
    return rssi == null ? '–' : dbm(rssi)
  },
}
