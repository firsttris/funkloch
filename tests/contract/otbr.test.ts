// Every recorded OTBR answer (bun run record) that the Thread adapter reads must pass its schemas,
// so the spec-based schemas meet a real border router here first.
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'
import type { z } from 'zod'
import {
  actionSchema,
  actionsSchema,
  datasetSchema,
  devicesSchema,
  diagnosticsSchema,
  energyScanSchema,
  legacyDiagnosticsSchema,
  NETWORK_DIAGNOSTIC_TYPES,
  networkDiagnosticSchema,
  nodeSchema,
} from '~/adapters/otbr/schemas'
import type { OtbrRecord } from '../../scripts/recorder/otbr'

const ROOT = join(import.meta.dirname, '../fixtures/recordings')

const recordings = (existsSync(ROOT) ? readdirSync(ROOT, { withFileTypes: true }) : [])
  .filter((entry) => entry.isDirectory() && existsSync(join(ROOT, entry.name, 'otbr.jsonl')))
  .map((entry) => entry.name)

const readRecords = (name: string): OtbrRecord[] =>
  readFileSync(join(ROOT, name, 'otbr.jsonl'), 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line))

/** The schema an answer must pass, by path; answers Funkloch does not read have none */
const schemaFor = (record: OtbrRecord): z.ZodType | null => {
  const path = record.path.split('?')[0] ?? ''
  if (path === '/api/devices') return devicesSchema
  if (path === '/api/diagnostics') return diagnosticsSchema
  if (path === '/api/actions') return actionsSchema
  if (/^\/api\/actions\/[^/]+$/.test(path)) return actionSchema
  if (path === '/diagnostics') return legacyDiagnosticsSchema
  if (path === '/node') return nodeSchema
  if (path === '/node/dataset/active' && typeof record.body === 'object') return datasetSchema
  return null
}

/** The items of a diagnostics answer, checked by their type */
const diagnosticItems = (body: unknown): unknown[] => {
  const data = (body as { data?: unknown })?.data
  return Array.isArray(data) ? data : data ? [data] : []
}

describe.skipIf(recordings.length === 0)('recorded OTBR answers', () => {
  test.each(recordings)('%s parses without schema errors', (name) => {
    const problems: string[] = []
    let checked = 0
    for (const record of readRecords(name)) {
      if (record.status !== 200) continue
      const schema = schemaFor(record)
      if (schema) {
        checked++
        const result = schema.safeParse(record.body)
        if (!result.success)
          problems.push(`${record.method} ${record.path}: ${result.error.message}`)
      }
      if (record.path.startsWith('/api/diagnostics')) {
        for (const item of diagnosticItems(record.body)) {
          const type = (item as { type?: string }).type
          const itemSchema = NETWORK_DIAGNOSTIC_TYPES.some((t) => t === type)
            ? networkDiagnosticSchema
            : type === 'energyScanReport'
              ? energyScanSchema
              : null
          const result = itemSchema?.safeParse(item)
          if (result && !result.success) problems.push(`${type}: ${result.error.message}`)
        }
      }
    }
    expect(problems).toEqual([])
    expect(checked).toBeGreaterThan(0)
  })
})
