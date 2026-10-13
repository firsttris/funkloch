import type { Config } from '~/config'
import type { SignalFormat } from '~/db/detect'
import type { Log } from '~/server/log'
import { createOtbrAdapter } from './otbr/adapter'
import { threadMeta } from './otbr/meta'
import type { Adapter, ProtocolMeta } from './types'
import { createZigbee2mqttAdapter } from './zigbee2mqtt/adapter'
import { zigbeeMeta } from './zigbee2mqtt/meta'

export const PROTOCOLS: Record<string, ProtocolMeta> = {
  [zigbeeMeta.id]: zigbeeMeta,
  [threadMeta.id]: threadMeta,
}

/** An adapter is on when its environment variable is set. */
export const adaptersFromConfig = (
  config: Config,
  log: Log,
  networkmapHours: () => number,
): Adapter[] => {
  const adapters: Adapter[] = []
  if (config.ZIGBEE2MQTT_MQTT_URL) {
    adapters.push(
      createZigbee2mqttAdapter({
        url: config.ZIGBEE2MQTT_MQTT_URL,
        username: config.ZIGBEE2MQTT_MQTT_USER,
        password: config.ZIGBEE2MQTT_MQTT_PASSWORD,
        baseTopic: config.ZIGBEE2MQTT_BASE_TOPIC,
        networkmapHours,
        onInvalid: (message) =>
          log.warn({ message }, 'zigbee2mqtt payload does not match the schema'),
      }),
    )
  }
  if (config.OTBR_URL) {
    adapters.push(
      createOtbrAdapter({
        url: config.OTBR_URL,
        onProblem: (message) => log.warn({ message }, 'otbr'),
        onMode: (mode) => log.info({ mode }, 'otbr REST API found'),
      }),
    )
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
