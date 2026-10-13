// Ebene 4: the Zigbee2MQTT adapter against a real broker, from MQTT message to database row.
import mqtt from 'mqtt'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { createZigbee2mqttAdapter } from '~/adapters/zigbee2mqtt/adapter'
import { devices, samples } from '~/db/schema'
import { tempDb } from '~/db/test-db'
import { createIngest } from '~/server/ingest'
import { createLog } from '~/server/log'

const url = process.env.MQTT_TEST_URL
const base = `funkloch-test-${Date.now()}`

const bridgeDevices = [
  {
    ieee_address: '0x00124b0012345678',
    type: 'Coordinator',
    network_address: 0,
    friendly_name: 'Coordinator',
    definition: null,
  },
  {
    ieee_address: '0x00158d0001a2b3c4',
    type: 'EndDevice',
    network_address: 4660,
    friendly_name: 'Keller/Sensor',
    definition: { model: 'WSDCGQ11LM', vendor: 'Aqara', description: 'sensor' },
    power_source: 'Battery',
  },
]

const until = async (check: () => boolean, timeout = 10_000) => {
  const start = Date.now()
  while (!check()) {
    if (Date.now() - start > timeout) throw new Error('timed out')
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
}

describe.skipIf(!url)('Zigbee2MQTT adapter with a broker', () => {
  const { db, cleanup } = tempDb()
  const ingest = createIngest(db, createLog('silent'))
  const adapter = createZigbee2mqttAdapter({
    url: url ?? '',
    baseTopic: base,
    networkmapHours: () => 6,
  })
  let stop: () => Promise<void> = async () => {}
  let publisher: mqtt.MqttClient

  beforeAll(async () => {
    publisher = await mqtt.connectAsync(url ?? '')
    await publisher.publishAsync(`${base}/bridge/devices`, JSON.stringify(bridgeDevices), {
      retain: true,
    })
    stop = adapter.start(ingest.emit)
    await until(() => adapter.status().connected)
  })

  afterAll(async () => {
    await stop()
    ingest.stop()
    await publisher.publishAsync(`${base}/bridge/devices`, '', { retain: true })
    await publisher.endAsync()
    cleanup()
  })

  test('the retained device list arrives on subscribe', async () => {
    await until(() => db.select().from(devices).all().length === 2)
    expect(db.select({ name: devices.name, role: devices.role }).from(devices).all()).toEqual([
      { name: 'Coordinator', role: 'coordinator' },
      { name: 'Keller/Sensor', role: 'end_device' },
    ])
  })

  test('device messages become samples within a second', async () => {
    await publisher.publishAsync(
      `${base}/Keller/Sensor`,
      JSON.stringify({ linkquality: 38, battery: 64 }),
    )
    await publisher.publishAsync(`${base}/Keller/Sensor`, JSON.stringify({ linkquality: 51 }))
    await until(() => db.select().from(samples).all().length === 2)
    expect(db.select({ raw: samples.raw, score: samples.score }).from(samples).all()).toEqual([
      { raw: 38, score: 15 },
      { raw: 51, score: 20 },
    ])
    const sensor = db
      .select()
      .from(devices)
      .all()
      .find((d) => d.name === 'Keller/Sensor')
    expect(sensor?.battery).toBe(64)
    expect(sensor?.lastSeen).toBeGreaterThan(0)
  })

  test('an offline report turns the device offline', async () => {
    await publisher.publishAsync(
      `${base}/Keller/Sensor/availability`,
      JSON.stringify({ state: 'offline' }),
      {
        retain: true,
      },
    )
    await until(() =>
      db
        .select()
        .from(devices)
        .all()
        .some((d) => d.online === false),
    )
    await publisher.publishAsync(`${base}/Keller/Sensor/availability`, '', { retain: true })
  })
})
