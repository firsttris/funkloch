// The three ways out: ntfy, a generic JSON webhook and an MQTT topic. Each returns an error
// message instead of throwing, so one broken channel does not stop the others.
import type { Settings } from '~/core/settings'
import type { Notification } from './message'

export type ChannelResult = { channel: 'ntfy' | 'webhook' | 'mqtt'; ok: boolean; error?: string }

/** Publishes on MQTT; the notifier holds one connection to the broker */
export type MqttPublisher = (topic: string, payload: string) => Promise<void>

const TIMEOUT = 10_000

const describe = (error: unknown) => (error instanceof Error ? error.message : String(error))

/** Header values travel as Latin-1; anything beyond ASCII goes RFC 2047 encoded, as ntfy reads it */
const headerSafe = (text: string) =>
  /^[\x20-\x7e]*$/.test(text) ? text : `=?UTF-8?B?${Buffer.from(text).toString('base64')}?=`

const post = async (url: string, init: RequestInit) => {
  const response = await fetch(url, {
    ...init,
    method: 'POST',
    signal: AbortSignal.timeout(TIMEOUT),
  })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
}

export const sendNtfy = async (
  ntfy: Settings['channels']['ntfy'],
  note: Notification,
  priority = 'default',
): Promise<ChannelResult> => {
  try {
    await post(`${ntfy.server.replace(/\/+$/, '')}/${encodeURIComponent(ntfy.topic)}`, {
      body: note.message,
      headers: {
        Title: headerSafe(note.title),
        Tags: 'satellite',
        Priority: priority,
        ...(note.url ? { Click: note.url } : {}),
        ...(ntfy.token ? { Authorization: `Bearer ${ntfy.token}` } : {}),
      },
    })
    return { channel: 'ntfy', ok: true }
  } catch (error) {
    return { channel: 'ntfy', ok: false, error: describe(error) }
  }
}

export const sendWebhook = async (url: string, note: Notification): Promise<ChannelResult> => {
  try {
    await post(url, {
      body: JSON.stringify(note.payload),
      headers: { 'content-type': 'application/json', 'user-agent': 'Funkloch' },
    })
    return { channel: 'webhook', ok: true }
  } catch (error) {
    return { channel: 'webhook', ok: false, error: describe(error) }
  }
}

export const sendMqtt = async (
  publish: MqttPublisher | null,
  topic: string,
  note: Notification,
): Promise<ChannelResult> => {
  if (!publish) return { channel: 'mqtt', ok: false, error: 'no MQTT broker configured' }
  try {
    await publish(topic, JSON.stringify(note.payload))
    return { channel: 'mqtt', ok: true }
  } catch (error) {
    return { channel: 'mqtt', ok: false, error: describe(error) }
  }
}

/** Sends to every channel that is set up */
export const sendAll = async (
  channels: Settings['channels'],
  note: Notification,
  publish: MqttPublisher | null,
  priority?: string,
) => {
  const sends: Promise<ChannelResult>[] = []
  if (channels.ntfy.server && channels.ntfy.topic)
    sends.push(sendNtfy(channels.ntfy, note, priority))
  if (channels.webhook.url) sends.push(sendWebhook(channels.webhook.url, note))
  if (channels.mqtt.enabled) sends.push(sendMqtt(publish, channels.mqtt.topic, note))
  return Promise.all(sends)
}
