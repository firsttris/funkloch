// Secrets that show up in what the recorder sees: the Zigbee network key and MQTT password in
// zigbee2mqtt/bridge/info, the Thread network key and PSKc in /node/dataset/active.
const SECRET_KEYS = new Set([
  'networkkey',
  'pskc',
  'pskd',
  'password',
  'authtoken',
  'token',
  'secret',
  'activedataset',
  'pendingdataset',
])

const normalizeKey = (key: string) => key.toLowerCase().replace(/[_-]/g, '')

export const REDACTED = '[redacted]'

export const redact = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(redact)
  if (value === null || typeof value !== 'object') return value
  return Object.fromEntries(
    Object.entries(value).map(([key, inner]) => [
      key,
      SECRET_KEYS.has(normalizeKey(key)) ? REDACTED : redact(inner),
    ]),
  )
}

/** Parses JSON when it is JSON; Zigbee2MQTT also publishes plain strings ("online"). */
export const parsePayload = (text: string): unknown => {
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

/** A Thread dataset in TLV hex form carries the network key; never keep it. */
export const redactBody = (path: string, body: unknown): unknown =>
  path.startsWith('/node/dataset/') && typeof body === 'string' ? REDACTED : redact(body)
