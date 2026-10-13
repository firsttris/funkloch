import { describe, expect, test } from 'vitest'
import { loadConfig } from './config'

describe('loadConfig', () => {
  test('uses the defaults; empty variables switch adapters off', () => {
    const config = loadConfig({ ZIGBEE2MQTT_MQTT_URL: '', OTBR_URL: '' })
    expect(config).toMatchObject({
      ZIGBEE2MQTT_MQTT_URL: undefined,
      OTBR_URL: undefined,
      ZIGBEE2MQTT_BASE_TOPIC: 'zigbee2mqtt',
      ZIGBEE2MQTT_NETWORKMAP_HOURS: 6,
      PORT: 8090,
      FUNKLOCH_DEMO: false,
    })
  })

  test('reads the adapters and the demo flag', () => {
    const config = loadConfig({
      ZIGBEE2MQTT_MQTT_URL: 'mqtt://localhost:1883',
      OTBR_URL: 'http://localhost:8081',
      FUNKLOCH_DEMO: '1',
    })
    expect(config.ZIGBEE2MQTT_MQTT_URL).toBe('mqtt://localhost:1883')
    expect(config.OTBR_URL).toBe('http://localhost:8081')
    expect(config.FUNKLOCH_DEMO).toBe(true)
  })

  test('rejects a network map interval below one hour and a broken URL', () => {
    expect(() => loadConfig({ ZIGBEE2MQTT_NETWORKMAP_HOURS: '0.5' })).toThrow(/NETWORKMAP/)
    expect(() => loadConfig({ OTBR_URL: 'not a url' })).toThrow(/OTBR_URL/)
  })
})
