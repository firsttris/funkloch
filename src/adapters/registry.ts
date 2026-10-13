import type { Config } from '~/config'
import type { SignalFormat } from '~/db/detect'
import type { Log } from '~/server/log'
import { threadMeta } from './otbr/meta'
import type { Adapter, ProtocolMeta } from './types'
import { createZigbee2mqttAdapter } from './zigbee2mqtt/adapter'
import { zigbeeMeta } from './zigbee2mqtt/meta'

export const PROTOCOLS: Record<string, ProtocolMeta> = {
  [zigbeeMeta.id]: zigbeeMeta,
  [threadMeta.id]: threadMeta,
}

/** An adapter is on when its environment variable is set. */
export const adaptersFromConfig = (config: Config, log: Log): Adapter[] => {
  const adapters: Adapter[] = []
  if (config.ZIGBEE2MQTT_MQTT_URL) {
    adapters.push(
      createZigbee2mqttAdapter({
        url: config.ZIGBEE2MQTT_MQTT_URL,
        username: config.ZIGBEE2MQTT_MQTT_USER,
        password: config.ZIGBEE2MQTT_MQTT_PASSWORD,
        baseTopic: config.ZIGBEE2MQTT_BASE_TOPIC,
        networkmapHours: config.ZIGBEE2MQTT_NETWORKMAP_HOURS,
        onInvalid: (message) =>
          log.warn({ message }, 'zigbee2mqtt payload does not match the schema'),
      }),
    )
  }
  if (config.OTBR_URL) {
    // The Thread adapter follows once the recorded OTBR answers settle its schemas (phase 2)
    log.warn('OTBR_URL is set, but the Thread adapter is not available yet')
  }
  return adapters
}

/** Values in the protocol's own unit for event texts */
export const signalFormat: SignalFormat = {
  value: (protocol, sample) => PROTOCOLS[protocol]?.formatRaw(sample) ?? String(sample.raw),
  threshold: (protocol, weak) => {
    const meta = PROTOCOLS[protocol]
    const raw = meta?.rawAtScore?.(weak)
    return meta && raw !== undefined ? `${meta.raw.label} ${raw}` : `${weak} %`
  },
}
