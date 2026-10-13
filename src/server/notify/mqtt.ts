import mqtt from 'mqtt'
import type { MqttPublisher } from './channels'

/** How long a notification waits for the broker */
export const CONNECT_WAIT = 10_000

/** One connection to the broker for notifications, opened on first use */
export const createMqttPublisher = (options: {
  url: string
  username?: string
  password?: string
}): { publish: MqttPublisher; close: () => Promise<void> } => {
  let client: mqtt.MqttClient | null = null
  const connect = () => {
    client ??= mqtt.connect(options.url, {
      username: options.username,
      password: options.password,
      clientId: `funkloch-notify-${Math.random().toString(16).slice(2, 10)}`,
      reconnectPeriod: 5000,
      connectTimeout: 10_000,
    })
    return client
  }
  return {
    publish: async (topic, payload) => {
      const c = connect()
      if (!c.connected) {
        await new Promise<void>((resolve, reject) => {
          const connected = () => {
            clearTimeout(timer)
            resolve()
          }
          // Without removing the listener, every event during an outage would leave one behind
          const timer = setTimeout(() => {
            c.off('connect', connected)
            reject(new Error('MQTT broker not reachable'))
          }, CONNECT_WAIT)
          c.once('connect', connected)
        })
      }
      await c.publishAsync(topic, payload, { qos: 1 })
    },
    close: () =>
      new Promise((resolve) => (client ? client.end(false, {}, () => resolve()) : resolve())),
  }
}
