import { afterAll, afterEach, beforeAll, describe, expect, test } from 'vitest'
import { DEFAULT_SETTINGS, type Settings } from '~/core/settings'
import { HOUR, MINUTE } from '~/core/types'
import { devices, events } from '~/db/schema'
import { addEvent, applyDevices } from '~/db/store'
import { tempDb } from '~/db/test-db'
import { runNotifications } from './notifier'

type Received = { path: string; headers: Record<string, string>; body: string }
const received: Received[] = []
let server: ReturnType<typeof Bun.serve>
let failWebhook = false

beforeAll(() => {
  server = Bun.serve({
    port: 0,
    async fetch(request) {
      const url = new URL(request.url)
      if (url.pathname === '/hook' && failWebhook) return new Response('down', { status: 500 })
      received.push({
        path: url.pathname,
        headers: Object.fromEntries(request.headers),
        body: await request.text(),
      })
      return new Response('ok')
    },
  })
})
afterAll(() => server.stop(true))

let cleanup = () => {}
afterEach(() => {
  cleanup()
  received.length = 0
  failWebhook = false
})

const T0 = 1000 * HOUR

const setup = () => {
  const t = tempDb()
  cleanup = t.cleanup
  applyDevices(
    t.db,
    'zigbee',
    [
      {
        protocol: 'zigbee',
        address: '0xabc',
        name: 'Türsensor Garage',
        role: 'end_device',
        model: null,
        vendor: null,
        power: 'battery',
        networkAddress: null,
      },
    ],
    0,
  )
  const deviceId = t.db.select().from(devices).get()?.id ?? 0
  return { db: t.db, deviceId }
}

const withChannels = (): Settings => ({
  ...DEFAULT_SETTINGS,
  publicUrl: 'https://funkloch.example',
  channels: {
    ntfy: { server: `http://localhost:${server.port}`, topic: 'funk loch', token: 'secret' },
    webhook: { url: `http://localhost:${server.port}/hook` },
    mqtt: { enabled: false, topic: 'funkloch/events' },
  },
})

const deliveries = (db: ReturnType<typeof setup>['db']) =>
  db.select({ type: events.type, delivery: events.delivery }).from(events).all()

describe('runNotifications', () => {
  test('an offline device is reported after the wait, to ntfy and the webhook', async () => {
    const { db, deviceId } = setup()
    db.update(devices).set({ online: false }).run()
    addEvent(db, {
      ts: T0,
      kind: 'offline',
      type: 'offline',
      protocol: 'zigbee',
      deviceId,
      details: { reason: 'silent' },
    })

    expect(await runNotifications(db, T0 + 10 * MINUTE, withChannels(), null)).toEqual({
      sent: 0,
      skipped: 0,
      failed: 0,
    })
    expect(received).toEqual([])

    expect(await runNotifications(db, T0 + 61 * MINUTE, withChannels(), null)).toMatchObject({
      sent: 1,
    })
    const ntfy = received.find((r) => r.path === '/funk%20loch')
    expect(ntfy?.headers).toMatchObject({
      title: '=?UTF-8?B?T2ZmbGluZTogVMO8cnNlbnNvciBHYXJhZ2U=?=',
      priority: 'high',
      click: `https://funkloch.example/devices/${deviceId}`,
      authorization: 'Bearer secret',
    })
    expect(ntfy?.body).toBe('länger still als üblich')
    const hook = JSON.parse(received.find((r) => r.path === '/hook')?.body ?? '{}')
    expect(hook).toMatchObject({
      type: 'offline',
      kind: 'offline',
      device: { name: 'Türsensor Garage', address: '0xabc' },
    })
    expect(deliveries(db)).toEqual([{ type: 'offline', delivery: 'sent' }])
  })

  test('the way back online follows only a sent offline message', async () => {
    const { db, deviceId } = setup()
    db.update(devices).set({ online: false }).run()
    addEvent(db, { ts: T0, kind: 'offline', type: 'offline', protocol: 'zigbee', deviceId })
    await runNotifications(db, T0 + 61 * MINUTE, withChannels(), null)
    db.update(devices).set({ online: true }).run()
    addEvent(db, {
      ts: T0 + 70 * MINUTE,
      kind: 'offline',
      type: 'online',
      protocol: 'zigbee',
      deviceId,
    })
    await runNotifications(db, T0 + 71 * MINUTE, withChannels(), null)
    expect(deliveries(db)).toEqual([
      { type: 'offline', delivery: 'sent' },
      { type: 'online', delivery: 'sent' },
    ])
  })

  test('a short outage makes no message at all', async () => {
    const { db, deviceId } = setup()
    addEvent(db, { ts: T0, kind: 'offline', type: 'offline', protocol: 'zigbee', deviceId })
    addEvent(db, {
      ts: T0 + 5 * MINUTE,
      kind: 'offline',
      type: 'online',
      protocol: 'zigbee',
      deviceId,
    })
    await runNotifications(db, T0 + 6 * MINUTE, withChannels(), null)
    expect(received).toEqual([])
    expect(deliveries(db)).toEqual([
      { type: 'offline', delivery: 'skipped' },
      { type: 'online', delivery: 'skipped' },
    ])
  })

  test('the same event within an hour is sent once', async () => {
    const { db, deviceId } = setup()
    addEvent(db, {
      ts: T0,
      kind: 'signal',
      type: 'signal_weak',
      protocol: 'zigbee',
      deviceId,
      details: { value: 'LQI 30' },
    })
    addEvent(db, {
      ts: T0 + 20 * MINUTE,
      kind: 'signal',
      type: 'signal_weak',
      protocol: 'zigbee',
      deviceId,
    })
    await runNotifications(db, T0 + 21 * MINUTE, withChannels(), null)
    expect(deliveries(db).map((d) => d.delivery)).toEqual(['sent', 'skipped'])
  })

  test('one failing channel still counts as sent, all failing as failed', async () => {
    const { db, deviceId } = setup()
    failWebhook = true
    addEvent(db, { ts: T0, kind: 'signal', type: 'trend_down', protocol: 'zigbee', deviceId })
    await runNotifications(db, T0 + MINUTE, withChannels(), null)
    expect(deliveries(db)).toEqual([{ type: 'trend_down', delivery: 'sent' }])

    const onlyHook = withChannels()
    onlyHook.channels.ntfy.topic = ''
    addEvent(db, {
      ts: T0 + 2 * HOUR,
      kind: 'signal',
      type: 'pattern',
      protocol: 'zigbee',
      deviceId,
    })
    await runNotifications(db, T0 + 2 * HOUR + MINUTE, onlyHook, null)
    expect(deliveries(db).at(-1)).toEqual({ type: 'pattern', delivery: 'failed' })
  })

  test('without any channel everything is skipped', async () => {
    const { db, deviceId } = setup()
    addEvent(db, { ts: T0, kind: 'signal', type: 'signal_weak', protocol: 'zigbee', deviceId })
    expect(await runNotifications(db, T0 + MINUTE, DEFAULT_SETTINGS, null)).toEqual({
      sent: 0,
      skipped: 1,
      failed: 0,
    })
  })

  test('MQTT publishes the event as JSON on the topic, in English when set', async () => {
    const { db, deviceId } = setup()
    const published: { topic: string; payload: string }[] = []
    const settings = { ...withChannels(), language: 'en' as const }
    settings.channels = {
      ...settings.channels,
      ntfy: { ...settings.channels.ntfy, topic: '' },
      webhook: { url: '' },
      mqtt: { enabled: true, topic: 'funkloch/events' },
    }
    addEvent(db, {
      ts: T0,
      kind: 'network',
      type: 'device_added',
      protocol: 'zigbee',
      deviceId,
      details: { role: 'router' },
    })
    await runNotifications(db, T0 + MINUTE, settings, async (topic, payload) => {
      published.push({ topic, payload })
    })
    expect(published).toHaveLength(1)
    expect(published[0]?.topic).toBe('funkloch/events')
    expect(JSON.parse(published[0]?.payload ?? '{}')).toMatchObject({
      type: 'device_added',
      title: 'Joined the network: Türsensor Garage',
      message: 'Router',
    })
  })
})
