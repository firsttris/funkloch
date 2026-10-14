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

  test('the demo can stand still at a moment given as ISO time', () => {
    expect(loadConfig({}).FUNKLOCH_DEMO_NOW).toBeUndefined()
    expect(loadConfig({ FUNKLOCH_DEMO_NOW: '' }).FUNKLOCH_DEMO_NOW).toBeUndefined()
    expect(loadConfig({ FUNKLOCH_DEMO_NOW: '2026-10-13T06:30:00Z' }).FUNKLOCH_DEMO_NOW).toBe(
      Date.parse('2026-10-13T06:30:00Z'),
    )
    expect(() => loadConfig({ FUNKLOCH_DEMO_NOW: 'yesterday' })).toThrow(/FUNKLOCH_DEMO_NOW/)
  })

  test('reads matterjs-server’s WebSocket and the poll interval', () => {
    const config = loadConfig({ MATTER_SERVER_URL: 'ws://localhost:5580/ws' })
    expect(config.MATTER_SERVER_URL).toBe('ws://localhost:5580/ws')
    expect(config.MATTER_POLL_MINUTES).toBe(15)
    expect(loadConfig({ MATTER_SERVER_URL: '' }).MATTER_SERVER_URL).toBeUndefined()
    expect(() => loadConfig({ MATTER_SERVER_URL: 'http://localhost:5580' })).toThrow(/ws:\/\//)
    expect(() => loadConfig({ MATTER_POLL_MINUTES: '1' })).toThrow(/MATTER_POLL_MINUTES/)
  })

  test('rejects a network map interval below one hour and a broken URL', () => {
    expect(() => loadConfig({ ZIGBEE2MQTT_NETWORKMAP_HOURS: '0.5' })).toThrow(/NETWORKMAP/)
    expect(() => loadConfig({ OTBR_URL: 'not a url' })).toThrow(/OTBR_URL/)
  })
})
