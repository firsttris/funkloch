// Every recorded matterjs-server message (bun run record) that the Matter adapter reads must pass
// its schemas, and the recorded nodes must translate, so the source-based schemas meet a real
// server here first. Without recordings the spec network stands in.
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'
import { specNetwork } from '~/adapters/matter/fake'
import { toNode } from '~/adapters/matter/nodes'
import {
  attributeUpdateSchema,
  borderRouterSchema,
  eventMessageSchema,
  neighborSchema,
  nodeSchema,
  resultMessageSchema,
  serverInfoSchema,
} from '~/adapters/matter/schemas'
import { cycleObservations } from '~/adapters/matter/translate'
import { parseWire } from '~/adapters/matter/wire'
import type { MatterRecord } from '../../scripts/recorder/matter'

const ROOT = join(import.meta.dirname, '../fixtures/recordings')

const recordings = (existsSync(ROOT) ? readdirSync(ROOT, { withFileTypes: true }) : [])
  .filter((entry) => entry.isDirectory() && existsSync(join(ROOT, entry.name, 'matter.jsonl')))
  .map((entry) => entry.name)

const readRecords = (name: string): MatterRecord[] =>
  readFileSync(join(ROOT, name, 'matter.jsonl'), 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line))

type Wire = { message_id?: string; command?: string; event?: string; result?: unknown }

/** The answers by the command that asked for them, the events, and the server info */
const conversation = (records: readonly MatterRecord[]) => {
  const messages = records.map((r) => ({ ...r, wire: parseWire(r.message) as Wire }))
  const commands = new Map(
    messages.filter((m) => m.direction === 'out').map((m) => [m.wire.message_id, m.wire.command]),
  )
  const incoming = messages.filter((m) => m.direction === 'in').map((m) => m.wire)
  return {
    info: incoming.find((m) => m.message_id === undefined && m.event === undefined),
    answers: (command: string) =>
      incoming.filter((m) => m.message_id && commands.get(m.message_id) === command),
    events: incoming.filter((m) => m.event !== undefined),
  }
}

const problemsOf = (schema: { safeParse: (v: unknown) => { success: boolean } }, value: unknown) =>
  schema.safeParse(value).success ? [] : [JSON.stringify(value).slice(0, 200)]

describe.skipIf(recordings.length === 0)('recorded matterjs-server messages', () => {
  test.each(recordings)('%s parses without schema errors and translates', (name) => {
    const talk = conversation(readRecords(name))
    const problems: string[] = [...problemsOf(serverInfoSchema, talk.info)]
    const nodes = talk.answers('start_listening').flatMap((answer) => {
      problems.push(...problemsOf(resultMessageSchema, answer))
      return Array.isArray(answer.result) ? answer.result : []
    })
    for (const node of nodes) problems.push(...problemsOf(nodeSchema, node))
    const parsed = nodes.flatMap((n) => {
      const result = nodeSchema.safeParse(n)
      return result.success ? [toNode(result.data)] : []
    })
    for (const node of parsed) {
      const table = node.attributes['0/53/7']
      for (const entry of Array.isArray(table) ? table : [])
        problems.push(...problemsOf(neighborSchema, entry))
    }
    const routers = talk
      .answers('get_thread_border_routers')
      .flatMap((answer) => (Array.isArray(answer.result) ? answer.result : []))
    for (const router of routers) problems.push(...problemsOf(borderRouterSchema, router))
    for (const event of talk.events) {
      problems.push(...problemsOf(eventMessageSchema, event))
      const data = (event as { data?: unknown }).data
      if (event.event === 'attribute_updated')
        problems.push(...problemsOf(attributeUpdateSchema, data))
      if (event.event === 'node_updated') problems.push(...problemsOf(nodeSchema, data))
    }
    expect(problems).toEqual([])
    expect(parsed.length).toBeGreaterThan(0)
    const observations = cycleObservations(
      parsed,
      routers.flatMap((r) => {
        const result = borderRouterSchema.safeParse(r)
        return result.success ? [result.data] : []
      }),
      Date.now(),
      true,
    )
    expect(observations.some((o) => o.kind === 'devices')).toBe(true)
  })
})

describe('the spec network', () => {
  test('passes the schemas the recordings will be held to', () => {
    const { nodes, borderRouters } = specNetwork()
    expect(nodes.every((n) => nodeSchema.safeParse(n).success)).toBe(true)
    expect(borderRouters.every((r) => borderRouterSchema.safeParse(r).success)).toBe(true)
  })
})
