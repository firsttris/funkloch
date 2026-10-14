// bun run record: records Zigbee2MQTT messages, OTBR REST answers and matterjs-server's WebSocket
// as fixtures. Read-only apart from one network map request and, where the OTBR has /api/actions,
// diagnostic queries; see docs/recording.md for what it sends and how to hand in the result.
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseArgs } from 'node:util'
import { recordMatter } from './recorder/matter'
import { createOtbrClient, pollOtbr } from './recorder/otbr'
import { recordZigbee2mqtt } from './recorder/zigbee2mqtt'

const { values } = parseArgs({
  options: {
    minutes: { type: 'string', default: '60' },
    out: { type: 'string' },
    'otbr-interval': { type: 'string', default: '15' },
    'no-networkmap': { type: 'boolean', default: false },
    'no-otbr-actions': { type: 'boolean', default: false },
    'energy-scan': { type: 'boolean', default: false },
    'matter-interval': { type: 'string', default: '15' },
    'no-matter-reads': { type: 'boolean', default: false },
  },
})

const env = process.env
const minutes = Number(values.minutes)
const otbrInterval = Number(values['otbr-interval'])
const startedAt = new Date()
const out = values.out ?? join('recordings', startedAt.toISOString().replace(/[:.]/g, '-'))

if (!env.ZIGBEE2MQTT_MQTT_URL && !env.OTBR_URL && !env.MATTER_SERVER_URL) {
  console.error('Set ZIGBEE2MQTT_MQTT_URL, OTBR_URL and/or MATTER_SERVER_URL. Example:')
  console.error(
    '  ZIGBEE2MQTT_MQTT_URL=mqtt://localhost:1883 OTBR_URL=http://localhost:8081 MATTER_SERVER_URL=ws://localhost:5580/ws bun run record',
  )
  process.exit(1)
}

mkdirSync(out, { recursive: true })
const appendJsonl = (file: string) => (record: unknown) =>
  appendFileSync(join(out, file), `${JSON.stringify(record)}\n`)

let mqttCount = 0
let otbrCount = 0
let matterCount = 0
const stops: (() => Promise<void>)[] = []
const timers: ReturnType<typeof setInterval>[] = []

if (env.ZIGBEE2MQTT_MQTT_URL) {
  const write = appendJsonl('zigbee2mqtt.jsonl')
  stops.push(
    recordZigbee2mqtt(
      {
        url: env.ZIGBEE2MQTT_MQTT_URL,
        username: env.ZIGBEE2MQTT_MQTT_USER || undefined,
        password: env.ZIGBEE2MQTT_MQTT_PASSWORD || undefined,
        baseTopic: env.ZIGBEE2MQTT_BASE_TOPIC || 'zigbee2mqtt',
        networkmap: !values['no-networkmap'],
      },
      (record) => {
        mqttCount++
        write(record)
      },
    ),
  )
}

if (env.OTBR_URL) {
  const write = appendJsonl('otbr.jsonl')
  const client = createOtbrClient(env.OTBR_URL, (record) => {
    otbrCount++
    const state = record.status ?? record.error
    console.log(`OTBR: ${record.method} ${record.path} → ${state}`)
    write(record)
  })
  const options = { actions: !values['no-otbr-actions'], energyScan: values['energy-scan'] }
  let running = pollOtbr(client, options)
  timers.push(
    setInterval(() => {
      running = running.then(() => pollOtbr(client, { ...options, energyScan: false }))
    }, otbrInterval * 60_000),
  )
  stops.push(() => running)
}

if (env.MATTER_SERVER_URL) {
  const write = appendJsonl('matter.jsonl')
  stops.push(
    recordMatter(
      {
        url: env.MATTER_SERVER_URL,
        intervalMinutes: Number(values['matter-interval']),
        reads: !values['no-matter-reads'],
      },
      (record) => {
        matterCount++
        write(record)
      },
    ),
  )
}

const progress = setInterval(
  () =>
    console.log(
      `… ${mqttCount} MQTT messages, ${otbrCount} OTBR answers, ${matterCount} Matter messages`,
    ),
  60_000,
)

const finish = async () => {
  clearInterval(progress)
  for (const timer of timers) clearInterval(timer)
  await Promise.all(stops.map((stop) => stop()))
  writeFileSync(
    join(out, 'meta.json'),
    `${JSON.stringify(
      {
        startedAt: startedAt.toISOString(),
        endedAt: new Date().toISOString(),
        minutes,
        options: values,
        zigbee2mqtt: env.ZIGBEE2MQTT_MQTT_URL
          ? { baseTopic: env.ZIGBEE2MQTT_BASE_TOPIC || 'zigbee2mqtt' }
          : null,
        otbr: env.OTBR_URL ? { url: env.OTBR_URL } : null,
        matter: env.MATTER_SERVER_URL ? { url: env.MATTER_SERVER_URL } : null,
        counts: { mqtt: mqttCount, otbr: otbrCount, matter: matterCount },
      },
      null,
      2,
    )}\n`,
  )
  console.log(
    `Done: ${mqttCount} MQTT messages, ${otbrCount} OTBR answers, ${matterCount} Matter messages in ${out}`,
  )
  process.exit(0)
}

console.log(`Recording for ${minutes} min into ${out} (Ctrl+C stops early and keeps the data)`)
setTimeout(finish, minutes * 60_000)
process.on('SIGINT', finish)
process.on('SIGTERM', finish)
