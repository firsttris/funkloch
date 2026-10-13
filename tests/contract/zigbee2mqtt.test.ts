// Ebene 2: every recorded Zigbee2MQTT message (bun run record) must pass the schemas, so a format
// change in a new Zigbee2MQTT release shows up here first.
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'
import { nameMap, parseMessage } from '~/adapters/zigbee2mqtt/parse'
import type { MqttRecord } from '../../scripts/recorder/zigbee2mqtt'

const ROOT = join(import.meta.dirname, '../fixtures/recordings')

const recordings = (existsSync(ROOT) ? readdirSync(ROOT, { withFileTypes: true }) : [])
  .filter((entry) => entry.isDirectory() && existsSync(join(ROOT, entry.name, 'zigbee2mqtt.jsonl')))
  .map((entry) => entry.name)

const readRecords = (name: string): MqttRecord[] =>
  readFileSync(join(ROOT, name, 'zigbee2mqtt.jsonl'), 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line))

describe.skipIf(recordings.length === 0)('recorded Zigbee2MQTT messages', () => {
  test.each(recordings)('%s parses without schema errors', (name) => {
    const records = readRecords(name)
    const baseTopic = records[0]?.topic.split('/')[0] ?? 'zigbee2mqtt'
    let byName = new Map<string, string>()
    const invalid: string[] = []
    let observations = 0
    for (const record of records) {
      const text =
        typeof record.payload === 'string' ? record.payload : JSON.stringify(record.payload)
      const result = parseMessage(
        { baseTopic, byName, now: Date.parse(record.ts), heard: new Set() },
        record.topic,
        text,
        record.retain,
      )
      if (result.devices) byName = nameMap(result.devices)
      if (result.invalid) invalid.push(result.invalid)
      observations += result.observations.length
    }
    expect(invalid).toEqual([])
    expect(observations).toBeGreaterThan(0)
  })
})
