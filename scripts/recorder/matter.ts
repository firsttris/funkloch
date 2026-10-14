// Records what matterjs-server says over its WebSocket (docs/websockets_api.md): the server info,
// the start_listening answer with every node and its attributes, the events that follow, the
// border routers it found and, every few minutes, the attributes the Matter adapter reads itself
// (src/adapters/matter/nodes.ts pollPaths). It only reads: no write, invoke or commissioning.
import { wsUrl } from '../../src/adapters/matter/client'
import { type MatterNode, pollPaths, toNode } from '../../src/adapters/matter/nodes'
import { nodeSchema } from '../../src/adapters/matter/schemas'
import { parseWire, stringifyWire } from '../../src/adapters/matter/wire'
import { REDACTED, redact } from './redact'

/** One message as it went over the line; `message` is the wire text, so 64-bit numbers stay exact */
export type MatterRecord = { ts: string; direction: 'in' | 'out'; message: string }

export type MatterOptions = { url: string; intervalMinutes: number; reads: boolean }

/**
 * Attributes that say who a device is beyond what Funkloch needs: the serial number and unique id
 * (BasicInformation 15 and 18) and the fabrics' certificates (OperationalCredentials, cluster 62).
 */
const PRIVATE_ATTRIBUTE = /^\d+\/(40\/(15|18)|62\/\d+)$/

export const redactAttributes = (attributes: Record<string, unknown>) =>
  Object.fromEntries(
    Object.entries(attributes).map(([path, value]) => [
      path,
      PRIVATE_ATTRIBUTE.test(path) ? REDACTED : redact(value),
    ]),
  )

/** A message with its attribute maps redacted, wherever they sit */
export const redactMessage = (value: unknown, key = ''): unknown => {
  // attribute_updated: [node_id, path, value]
  if (Array.isArray(value) && typeof value[1] === 'string' && PRIVATE_ATTRIBUTE.test(value[1]))
    return [value[0], value[1], REDACTED]
  if (Array.isArray(value)) return value.map((item) => redactMessage(item))
  if (value === null || typeof value !== 'object') return value
  const entries = Object.entries(value)
  if (key === 'attributes' || entries.some(([path]) => /^\d+\/\d+\/\d+$/.test(path)))
    return redactAttributes(value as Record<string, unknown>)
  return Object.fromEntries(entries.map(([k, inner]) => [k, redactMessage(inner, k)]))
}

export const recordMatter = (options: MatterOptions, write: (record: MatterRecord) => void) => {
  const socket = new WebSocket(wsUrl(options.url))
  const log = (direction: MatterRecord['direction'], message: unknown) =>
    write({
      ts: new Date().toISOString(),
      direction,
      message: stringifyWire(redactMessage(message)),
    })
  let next = 0
  const pending = new Map<string, (result: unknown) => void>()
  const nodes = new Map<string, MatterNode>()
  let timer: ReturnType<typeof setInterval> | null = null
  let round: Promise<void> = Promise.resolve()

  const request = (command: string, args?: Record<string, unknown>) =>
    new Promise<unknown>((resolve) => {
      const message = { message_id: `record-${++next}`, command, ...(args ? { args } : {}) }
      pending.set(message.message_id, resolve)
      setTimeout(() => {
        if (pending.delete(message.message_id)) resolve(null)
      }, 60_000)
      log('out', message)
      socket.send(stringifyWire(message))
    })

  const readRound = async () => {
    await request('get_thread_border_routers')
    if (!options.reads) return
    for (const node of nodes.values()) {
      const paths = pollPaths(node)
      if (paths.length > 0)
        await request('read_attribute', { node_id: node.nodeId, attribute_path: paths })
    }
  }

  socket.onmessage = (event) => {
    const text = String(event.data)
    let parsed: unknown
    try {
      parsed = parseWire(text)
    } catch {
      write({ ts: new Date().toISOString(), direction: 'in', message: text })
      return
    }
    log('in', parsed)
    const message = (parsed ?? {}) as { message_id?: string; result?: unknown; event?: string }
    if (message.message_id === undefined) {
      // The first message without an id and without an event is the server info
      if (next === 0 && message.event === undefined) {
        console.log('Matter: connected, listing the nodes')
        void request('start_listening').then((result) => {
          for (const item of Array.isArray(result) ? result : []) {
            const parsed = nodeSchema.safeParse(item)
            if (parsed.success) nodes.set(String(parsed.data.node_id), toNode(parsed.data))
          }
          console.log(`Matter: ${nodes.size} nodes`)
          round = readRound()
          timer = setInterval(() => {
            round = round.then(readRound)
          }, options.intervalMinutes * 60_000)
        })
      }
      return
    }
    const settle = pending.get(message.message_id)
    pending.delete(message.message_id)
    settle?.(message.result)
  }
  socket.onerror = () => console.error(`Matter: cannot reach ${options.url}`)

  return async () => {
    if (timer) clearInterval(timer)
    await round
    socket.close()
  }
}
