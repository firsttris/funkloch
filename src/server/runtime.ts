// The one long-running part of the process: database, adapters, ingest and jobs. Started once,
// on the first import of the server entry (src/server.ts), in dev and in production alike.
import '@tanstack/react-start/server-only'
import { mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { threadMeta } from '~/adapters/otbr/meta'
import { adaptersFromConfig } from '~/adapters/registry'
import type { Adapter } from '~/adapters/types'
import { zigbeeMeta } from '~/adapters/zigbee2mqtt/meta'
import { type Config, loadConfig } from '~/config'
import { type Db, openDb } from '~/db/client'
import { createDemoAdapter } from '~/demo/adapter'
import { seedDemo } from '~/demo/seed'
import { startScheduler } from '~/jobs/scheduler'
import { createIngest } from './ingest'
import { createLog, type Log } from './log'
import { defaultsFrom, loadSettings } from './settings'
import type { ViewContext } from './views/context'

export type Runtime = {
  config: Config
  db: Db
  log: Log
  adapters: Adapter[]
  startedAt: number
  /** Database, time, settings and adapters for one request */
  viewContext: () => ViewContext
  stop: () => Promise<void>
}

const openDatabase = (config: Config, now: number) => {
  mkdirSync(config.DATA_DIR, { recursive: true })
  if (!config.FUNKLOCH_DEMO) return openDb(join(config.DATA_DIR, 'funkloch.db'))
  // The demo starts fresh each time, so every start shows the same network
  const file = join(config.DATA_DIR, 'demo.db')
  for (const suffix of ['', '-wal', '-shm']) rmSync(file + suffix, { force: true })
  const db = openDb(file)
  seedDemo(db, now)
  return db
}

export const startRuntime = (config: Config): Runtime => {
  const log = createLog(config.LOG_LEVEL)
  const startedAt = Date.now()
  const db = openDatabase(config, startedAt)
  const adapters = config.FUNKLOCH_DEMO
    ? [createDemoAdapter(zigbeeMeta), createDemoAdapter(threadMeta)]
    : adaptersFromConfig(config, log)
  if (adapters.length === 0) {
    log.warn('No adapter is on: set ZIGBEE2MQTT_MQTT_URL or OTBR_URL, or FUNKLOCH_DEMO=1')
  }
  const ingest = createIngest(db, log)
  const stopAdapters = adapters.map((adapter) => adapter.start(ingest.emit))
  const stopScheduler = startScheduler(db, log)
  log.info(
    {
      adapters: adapters.map((a) => a.meta.id),
      demo: config.FUNKLOCH_DEMO,
      dataDir: config.DATA_DIR,
    },
    'funkloch started',
  )

  const settingsDefaults = defaultsFrom(config)
  const viewContext = (): ViewContext => ({
    db,
    now: Date.now(),
    settings: loadSettings(db, settingsDefaults),
    adapters,
  })

  const stop = async () => {
    stopScheduler()
    await Promise.all(stopAdapters.map((stopAdapter) => stopAdapter()))
    ingest.stop()
    db.$client.close()
  }
  return { config, db, log, adapters, startedAt, viewContext, stop }
}

// Kept on globalThis so a hot reload in dev does not start a second set of adapters
const holder = globalThis as typeof globalThis & { __funkloch?: Runtime }

export const getRuntime = (): Runtime => {
  holder.__funkloch ??= startRuntime(loadConfig())
  return holder.__funkloch
}
