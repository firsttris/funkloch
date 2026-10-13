// Ebene 4: notifications published on a real broker
import mqtt from 'mqtt'
import { afterAll, describe, expect, test } from 'vitest'
import { createMqttPublisher } from '~/server/notify/mqtt'

const url = process.env.MQTT_TEST_URL

describe.skipIf(!url)('MQTT notifications', () => {
  const publisher = createMqttPublisher({ url: url ?? '' })
  afterAll(() => publisher.close())

  test('a subscriber receives the published event', async () => {
    const topic = `funkloch-test/${Date.now()}/events`
    const subscriber = await mqtt.connectAsync(url ?? '')
    await subscriber.subscribeAsync(topic)
    const received = new Promise<string>((resolve) =>
      subscriber.on('message', (_topic, payload) => resolve(payload.toString())),
    )
    await publisher.publish(topic, JSON.stringify({ type: 'offline' }))
    expect(JSON.parse(await received)).toEqual({ type: 'offline' })
    await subscriber.endAsync()
  })
})
