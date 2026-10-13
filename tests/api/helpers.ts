import { threadMeta } from '~/adapters/otbr/meta'
import { zigbeeMeta } from '~/adapters/zigbee2mqtt/meta'
import { DEFAULT_SETTINGS, type Settings } from '~/core/settings'
import { tempDb } from '~/db/test-db'
import { createDemoAdapter } from '~/demo/adapter'
import { seedDemo } from '~/demo/seed'
import type { ViewContext } from '~/server/views/context'

export const NOW = Date.parse('2026-10-13T06:30:00Z')

/** A database seeded with the demo network at NOW, and a context for the views */
export const seeded = (settings: Settings = DEFAULT_SETTINGS) => {
  const { db, cleanup } = tempDb()
  seedDemo(db, NOW)
  const clock = () => NOW
  const adapters = [createDemoAdapter(zigbeeMeta, clock), createDemoAdapter(threadMeta, clock)]
  const context: ViewContext = { db, now: NOW, settings, adapters }
  return { db, context, cleanup }
}
