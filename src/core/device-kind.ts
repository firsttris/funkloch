// What a device is, for its icon on the map: guessed from the words in its name and model, German
// and English, since neither Zigbee2MQTT nor the border router gives a device class.
import { isRoot } from './topology'
import type { Role } from './types'

export type DeviceKind =
  | 'root'
  | 'router'
  | 'plug'
  | 'smoke'
  | 'switch'
  | 'motion'
  | 'contact'
  | 'climate'
  | 'water'
  | 'light'
  | 'blind'
  | 'device'

/** The first rule whose words occur in the name or model wins; order matters ("Lichtschalter") */
const RULES: [DeviceKind, RegExp][] = [
  ['smoke', /rauch|smoke|feuer|fire/],
  ['plug', /steckdose|stecker|plug|socket|outlet|zwischenstecker/],
  ['blind', /roll+(l)?aden|rolladen|jalousie|blind|shutter|cover|markise/],
  ['switch', /taster|schalter|switch|button|remote|fernbedienung|dimmer|knopf/],
  ['motion', /bewegung|präsenz|praesenz|motion|presence|occupancy|pir/],
  ['contact', /fenster|tür|tuer|door|window|kontakt|contact/],
  ['water', /wasser|leck|leak|water|feucht|moisture|pflanze|plant|boden|soil/],
  ['climate', /thermo|temperatur|temp|klima|climate|luft|air|co2|heizung|radiator|trv/],
  ['light', /lampe|licht|leuchte|light|bulb|lamp|led|strip|spot/],
]

export const deviceKind = (name: string, role: Role, model: string | null = null): DeviceKind => {
  if (isRoot(role)) return 'root'
  const text = `${name} ${model ?? ''}`.toLowerCase()
  const match = RULES.find(([, words]) => words.test(text))
  if (match) return match[0]
  return role === 'router' ? 'router' : 'device'
}
