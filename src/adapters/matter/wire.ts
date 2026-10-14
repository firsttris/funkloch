// The matterjs-server wire format: JSON whose 64-bit integers (node ids, extended addresses) are
// unquoted numbers above Number.MAX_SAFE_INTEGER (docs/websockets_api.md "BigInt Handling"), and
// whose octet strings (hardware addresses, BSSIDs) are base64.

type Reviver = (key: string, value: unknown, context?: { source?: string }) => unknown

/** Integers beyond 2^53 become bigint, read from their source text so no digit is lost */
const keepBigIntegers: Reviver = (_key, value, context) =>
  typeof value === 'number' && !Number.isSafeInteger(value) && context?.source?.match(/^-?\d+$/)
    ? BigInt(context.source)
    : value

export const parseWire = (text: string): unknown =>
  JSON.parse(text, keepBigIntegers as Parameters<typeof JSON.parse>[1])

/** The wire form of a request: bigint as an unquoted number, as the server writes them */
export const stringifyWire = (value: unknown) =>
  JSON.stringify(value, (_key, v) => (typeof v === 'bigint' ? `__big__${v}` : v)).replace(
    /"__big__(-?\d+)"/g,
    '$1',
  )

const hex = (bytes: Uint8Array) => [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')

/** The bytes of a base64 octet string; null when it is none */
export const octets = (value: unknown): Uint8Array | null => {
  if (typeof value !== 'string' || value === '') return null
  try {
    return Uint8Array.from(atob(value), (c) => c.charCodeAt(0))
  } catch {
    return null
  }
}

/**
 * A Thread extended address as 16 lowercase hex digits, as the OTBR adapter writes them. The
 * server sends a uint64 as number or bigint, a hardware address as base64; zero means none.
 */
export const extAddress = (value: unknown): string | null => {
  if (typeof value === 'number' && Number.isSafeInteger(value) && value > 0)
    return value.toString(16).padStart(16, '0')
  if (typeof value === 'bigint' && value > 0n) return value.toString(16).padStart(16, '0')
  const bytes = octets(value)
  return bytes?.length === 8 && bytes.some((b) => b !== 0) ? hex(bytes) : null
}

/** A MAC address or BSSID (6 bytes, base64) as aa:bb:cc:dd:ee:ff */
export const macAddress = (value: unknown): string | null => {
  const bytes = octets(value)
  if (bytes?.length !== 6 || bytes.every((b) => b === 0)) return null
  return hex(bytes).replace(/(..)(?!$)/g, '$1:')
}

/** A string sent as octets, such as a Wi-Fi network's SSID; null when it is not readable text */
export const octetText = (value: unknown): string | null => {
  const bytes = octets(value)
  if (!bytes) return null
  const text = new TextDecoder('utf-8', { fatal: false }).decode(bytes)
  return /^[\p{L}\p{N}\p{P}\p{S} ]+$/u.test(text) ? text : null
}
