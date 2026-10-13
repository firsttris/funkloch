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
  /** Hours between two network map requests; never below 1, the scan loads the network */
  networkmapHours: number
  onInvalid?: (message: string) => void
}

export const MIN_NETWORKMAP_HOURS = 1

export const createZigbee2mqttAdapter = (options: Zigbee2mqttOptions): Adapter => {
  let status: AdapterStatus = { connected: false, error: null, since: null }
  let client: mqtt.MqttClient | null = null
  let byName = new Map<string, string>()

  const requestTopology = () => {
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
    client.on('message', (topic, message, packet) => {
      const result = parseMessage(
        { baseTopic: options.baseTopic, byName, now: Date.now() },
        topic,
        message.toString(),
        packet.retain,
      )
      if (result.devices) byName = nameMap(result.devices)
      if (result.invalid) options.onInvalid?.(result.invalid)
      for (const observation of result.observations) emit(observation)
    })

    const hours = Math.max(options.networkmapHours, MIN_NETWORKMAP_HOURS)
    // The first map a few minutes after start, when the device list is in
    const first = setTimeout(requestTopology, 5 * 60_000)
    const timer = setInterval(requestTopology, hours * 3_600_000)

    return () =>
      new Promise<void>((resolve) => {
        clearTimeout(first)
        clearInterval(timer)
        if (!client) return resolve()
        client.end(false, {}, () => resolve())
      })
  }

  return { meta: zigbeeMeta, start, status: () => status, requestTopology }
}
