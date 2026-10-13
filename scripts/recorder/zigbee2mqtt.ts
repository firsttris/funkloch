// Records every message under the Zigbee2MQTT base topic, retained ones included, and asks once
// for the network map (lib/extension/networkMap.ts in Koenkk/zigbee2mqtt: request
// bridge/request/networkmap {type, routes}, answer on bridge/response/networkmap).
import mqtt from 'mqtt'
import { parsePayload, redact } from './redact'

export type MqttRecord = { ts: string; topic: string; retain: boolean; payload: unknown }

export type MqttOptions = {
  url: string
  username?: string
  password?: string
  baseTopic: string
  networkmap: boolean
}

export const recordZigbee2mqtt = (options: MqttOptions, write: (record: MqttRecord) => void) => {
  const client = mqtt.connect(options.url, {
    username: options.username,
    password: options.password,
    clientId: `funkloch-record-${Math.random().toString(16).slice(2, 10)}`,
  })
  let requested = false

  client.on('connect', () => {
    console.log(`MQTT: connected to ${options.url}, subscribing to ${options.baseTopic}/#`)
    client.subscribe(`${options.baseTopic}/#`)
    if (options.networkmap && !requested) {
      requested = true
      // Give the retained messages a moment, then ask once; large networks take minutes to answer
      setTimeout(() => {
        console.log('MQTT: requesting the network map (raw, with routes)')
        client.publish(
          `${options.baseTopic}/bridge/request/networkmap`,
          JSON.stringify({ type: 'raw', routes: true }),
        )
      }, 5000)
    }
  })
  client.on('error', (error) => console.error(`MQTT: ${error.message}`))
  client.on('message', (topic, message, packet) => {
    write({
      ts: new Date().toISOString(),
      topic,
      retain: packet.retain,
      payload: redact(parsePayload(message.toString())),
    })
  })

  return () => new Promise<void>((resolve) => client.end(false, {}, () => resolve()))
}
