import mqtt from 'mqtt'
import type { Observation } from '~/core/types'
import type { Adapter, AdapterStatus } from '../types'
import { zigbeeMeta } from './meta'
import { nameMap, parseMessage } from './parse'

export type Zigbee2mqttOptions = {
  url: string
  username?: string
  password?: string
  baseTopic: string
  /** Hours between two network map requests, read each time (settings); never below 1 */
  networkmapHours: () => number
  onInvalid?: (message: string) => void
}

export const MIN_NETWORKMAP_HOURS = 1
/** A router that sent its own linkquality within this time needs no reading from the map */
export const HEARD_WINDOW = 2 * 3_600_000

/** Addresses with a reading of their own within the window */
export const heardSince = (lastOwn: ReadonlyMap<string, number>, now: number) =>
  new Set([...lastOwn].filter(([, ts]) => now - ts < HEARD_WINDOW).map(([address]) => address))
/** The first map a few minutes after start, when the device list is in */
export const FIRST_MAP_AFTER = 5 * 60_000

/** Device messages held back until the first device list, at most this many */
export const EARLY_LIMIT = 5000

/**
 * A device topic needs the friendly names from bridge/devices. MQTT does not order the retained
 * messages of different topics, so a retained availability can arrive before the device list.
 */
export const needsNames = (baseTopic: string, topic: string) =>
  topic.startsWith(`${baseTopic}/`) && !topic.startsWith(`${baseTopic}/bridge/`)

type RawMessage = { topic: string; text: string; retained: boolean }

/** A map is due when the interval has passed since the last one (or the first wait since start) */
export const networkmapDue = (
  last: number | null,
  startedAt: number,
  now: number,
  hours: number,
) => {
  const interval = Math.max(hours, MIN_NETWORKMAP_HOURS) * 3_600_000
  return last === null ? now - startedAt >= FIRST_MAP_AFTER : now - last >= interval
}

export const createZigbee2mqttAdapter = (options: Zigbee2mqttOptions): Adapter => {
  let status: AdapterStatus = { connected: false, error: null, since: null }
  let client: mqtt.MqttClient | null = null
  let byName = new Map<string, string>()
  /** Time of each device's last own linkquality */
  const lastOwn = new Map<string, number>()

  let lastRequest: number | null = null

  const requestTopology = () => {
    lastRequest = Date.now()
    client?.publish(
      `${options.baseTopic}/bridge/request/networkmap`,
      JSON.stringify({ type: 'raw', routes: false }),
    )
  }

  const start = (emit: (observation: Observation) => void) => {
    client = mqtt.connect(options.url, {
      username: options.username,
      password: options.password,
      clientId: `funkloch-${Math.random().toString(16).slice(2, 10)}`,
      reconnectPeriod: 5000,
    })
    client.on('connect', () => {
      status = { connected: true, error: null, since: Date.now() }
      client?.subscribe(`${options.baseTopic}/#`)
    })
    client.on('close', () => {
      if (status.connected) status = { ...status, connected: false, since: Date.now() }
    })
    client.on('error', (error) => {
      status = { ...status, connected: false, error: error.message }
    })
    let namesKnown = false
    let early: RawMessage[] = []
    const handle = ({ topic, text, retained }: RawMessage) => {
      const now = Date.now()
      const result = parseMessage(
        { baseTopic: options.baseTopic, byName, now, heard: heardSince(lastOwn, now) },
        topic,
        text,
        retained,
      )
      if (result.devices) byName = nameMap(result.devices)
      if (result.invalid) options.onInvalid?.(result.invalid)
      for (const observation of result.observations) {
        if (observation.kind === 'measurement' && observation.measurement.source === 'message')
          lastOwn.set(observation.measurement.address, observation.measurement.ts)
        emit(observation)
      }
      return result.devices !== undefined
    }
    client.on('message', (topic, payload, packet) => {
      const message = { topic, text: payload.toString(), retained: packet.retain }
      if (!namesKnown && needsNames(options.baseTopic, topic)) {
        if (early.length < EARLY_LIMIT) early.push(message)
        return
      }
      if (handle(message) && !namesKnown) {
        namesKnown = true
        const held = early
        early = []
        for (const m of held) handle(m)
      }
    })

    const startedAt = Date.now()
    // A manual request counts as well, so it pushes the next scheduled one back
    const timer = setInterval(() => {
      if (networkmapDue(lastRequest, startedAt, Date.now(), options.networkmapHours()))
        requestTopology()
    }, 60_000)

    return () =>
      new Promise<void>((resolve) => {
        clearInterval(timer)
        if (!client) return resolve()
        client.end(false, {}, () => resolve())
      })
  }

  return {
    id: zigbeeMeta.id,
    label: zigbeeMeta.label,
    protocols: [zigbeeMeta],
    start,
    status: () => status,
    requestTopology: () => requestTopology(),
  }
}
