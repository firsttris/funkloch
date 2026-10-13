import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { m } from '~/paraglide/messages.js'
import { sendAll } from '../notify/channels'
import { notification } from '../notify/message'
import { getRuntime } from '../runtime'
import { saveSettings } from '../settings'

export const getSettings = createServerFn({ method: 'GET' }).handler(() => {
  const runtime = getRuntime()
  return {
    settings: runtime.viewContext().settings,
    /** MQTT notifications need the Zigbee2MQTT broker */
    mqttAvailable: runtime.mqttPublish !== null,
  }
})

/** Validated in full by the settings schema; the answer says what was wrong */
export const updateSettings = createServerFn({ method: 'POST' })
  .validator(z.object({ settings: z.unknown() }))
  .handler(({ data }) => saveSettings(getRuntime().db, data.settings))

export const sendTestNotification = createServerFn({ method: 'POST' }).handler(async () => {
  const runtime = getRuntime()
  const { settings } = runtime.viewContext()
  const note = notification(
    {
      id: 0,
      ts: Date.now(),
      kind: 'network',
      type: 'test',
      protocol: null,
      deviceId: null,
      device: null,
      details: {},
    },
    settings.language,
    settings.publicUrl,
  )
  const locale = { locale: settings.language }
  const title = m.notify_test_title({}, locale)
  const message = m.notify_test_message({}, locale)
  const test = { ...note, title, message, payload: { ...note.payload, title, message } }
  return { results: await sendAll(settings.channels, test, runtime.mqttPublish) }
})
