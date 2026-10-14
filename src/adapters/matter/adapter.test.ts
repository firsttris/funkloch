import { afterEach, describe, expect, test, vi } from 'vitest'
import type { Observation } from '~/core/types'
import { devices } from '~/db/schema'
import { tempDb } from '~/db/test-db'
import { createIngest } from '~/server/ingest'
import { createLog } from '~/server/log'
import { createMatterAdapter } from './adapter'
import type { Socket } from './client'
import { createFakeMatterServer } from './fake'

const until = async (check: () => boolean) => {
  for (let i = 0; i < 400 && !check(); i++) await new Promise((r) => setTimeout(r, 5))
}

const started = (threadSignal: boolean, server = createFakeMatterServer()) => {
  const problems: string[] = []
  const adapter = createMatterAdapter({
    url: 'ws://matter.test:5580',
    pollMinutes: 15,
    threadSignal,
    openSocket: server.open,
    onProblem: (p) => problems.push(p),
  })
  const observations: Observation[] = []
  const stop = adapter.start((o) => observations.push(o))
  return { server, adapter, observations, problems, stop }
}

const of = <K extends Observation['kind']>(list: Observation[], kind: K) =>
  list.filter((o): o is Extract<Observation, { kind: K }> => o.kind === kind)

afterEach(() => vi.useRealTimers())

describe('Matter adapter', () => {
  test('lists the nodes, reads only awake ones and emits both networks', async () => {
    const { server, adapter, observations, stop } = started(true)
    await until(() => of(observations, 'topology').length === 2)
    expect(adapter.status()).toMatchObject({ connected: true, error: null })
    expect(adapter.protocols.map((p) => p.id)).toEqual(['thread', 'wifi'])
    const reads = server.commands.filter((c) => c.command === 'read_attribute')
    expect(reads.map((c) => (c.args as { node_id: number }).node_id)).toEqual([1, 2, 4])
    expect(server.commands.map((c) => c.command)).toContain('get_thread_border_routers')
    expect(of(observations, 'bridge').map((o) => [o.protocol, o.online])).toEqual([
      ['thread', true],
      ['wifi', true],
    ])
    expect(of(observations, 'availability')).toHaveLength(4)
    const measured = of(observations, 'measurement').map((o) => o.measurement.address)
    expect(measured).toEqual(expect.arrayContaining(['1111111111111111', 'aa:bb:cc:00:11:22']))
    expect(of(observations, 'counters')).toHaveLength(1)
    expect(of(observations, 'channel')).toEqual([
      { kind: 'channel', protocol: 'thread', channel: 15 },
    ])
    await stop()
  })

  test('the cache of a sleeping device does not pass for a new reading', async () => {
    const { observations, stop } = started(true)
    await until(() => of(observations, 'topology').length === 2)
    // The Eve Door is never read; its own table (it hears its parent at −76) stays out
    const door = of(observations, 'measurement').find(
      (o) => o.measurement.address === '3333333333333333',
    )
    expect(door?.measurement.rssi).toBe(-78)
    const own = of(observations, 'topology')
      .flatMap((o) => o.topology.links)
      .filter((l) => l.to === '3333333333333333')
    expect(own).toEqual([])
    await stop()
  })

  test('next to the OTBR it only describes the Thread devices', async () => {
    const { server, adapter, observations, stop } = started(false)
    await until(() => of(observations, 'topology').length === 1)
    expect(adapter.protocols.map((p) => p.id)).toEqual(['wifi'])
    expect(server.commands.map((c) => c.command)).not.toContain('get_thread_border_routers')
    const thread = (o: Observation) =>
      (o.kind === 'measurement' && o.measurement.protocol === 'thread') ||
      (o.kind === 'topology' && o.topology.protocol === 'thread')
    expect(observations.filter(thread)).toEqual([])
    const lists = of(observations, 'devices').filter((o) => o.protocol === 'thread')
    expect(lists[0]).toMatchObject({
      source: { id: 'matter', prefer: ['name', 'vendor', 'model', 'power'] },
    })
    expect(of(observations, 'availability').map((o) => o.report.protocol)).toContain('thread')
    await stop()
  })

  test('next to the OTBR the battery level reaches the store without any report of it', async () => {
    const t = tempDb()
    const ingest = createIngest(t.db, createLog('silent'))
    const server = createFakeMatterServer()
    const adapter = createMatterAdapter({
      url: 'ws://matter.test:5580',
      pollMinutes: 15,
      threadSignal: false,
      openSocket: server.open,
    })
    const observations: Observation[] = []
    const stop = adapter.start((o) => {
      observations.push(o)
      ingest.emit(o)
    })
    const door = () =>
      t.db
        .select()
        .from(devices)
        .all()
        .find((d) => d.address === '3333333333333333')
    // The Eve Door (0/47/12 = 170) sleeps and is never read: its level comes with start_listening
    await until(() => of(observations, 'topology').length === 1)
    ingest.flush()
    const kinds = observations.map((o) => o.kind)
    expect(kinds.indexOf('battery')).toBeLessThan(kinds.indexOf('topology'))
    expect(door()).toMatchObject({ battery: 85, lastSeen: null })
    // and with every poll cycle, still without a report and without counting as a sign of life
    t.db.update(devices).set({ battery: null }).run()
    adapter.requestTopology?.('wifi')
    await until(() => of(observations, 'topology').length === 2)
    ingest.flush()
    expect(door()).toMatchObject({ battery: 85, lastSeen: null })
    expect(server.commands.map((c) => c.command)).not.toContain('attribute_updated')
    await stop()
    ingest.stop()
    t.cleanup()
  })

  test('a report is a sign of life; a node going offline is reported', async () => {
    const { server, observations, stop } = started(true)
    await until(() => of(observations, 'topology').length === 2)
    server.push('attribute_updated', [3, '1/47/12', 120])
    await until(() => of(observations, 'seen').length === 1)
    expect(of(observations, 'seen')[0]).toMatchObject({
      protocol: 'thread',
      address: '3333333333333333',
      battery: 60,
    })
    const offline = { ...server.nodes[1], available: false }
    server.push('node_updated', offline)
    await until(() => of(observations, 'availability').length === 5)
    expect(of(observations, 'availability').at(-1)?.report).toMatchObject({
      address: '2222222222222222',
      online: false,
    })
    await stop()
  })

  test('a lost connection is offline and comes back', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const { server, adapter, observations, problems, stop } = started(true)
    await until(() => adapter.status().connected)
    server.drop()
    await until(() => !adapter.status().connected)
    expect(problems).toContain('connection to matterjs-server lost')
    expect(
      of(observations, 'bridge')
        .slice(-2)
        .map((o) => o.online),
    ).toEqual([false, false])
    await vi.advanceTimersByTimeAsync(5_000)
    await until(() => adapter.status().connected)
    expect(server.connections()).toBe(1)
    expect(adapter.status().connected).toBe(true)
    await stop()
  })

  test('an unreachable server is named with its address', async () => {
    const problems: string[] = []
    const adapter = createMatterAdapter({
      url: 'ws://matter.test:5580',
      pollMinutes: 15,
      threadSignal: true,
      openSocket: () => {
        const socket = { onopen: null, onmessage: null, onclose: null, onerror: null } as Socket
        socket.send = () => {}
        socket.close = () => {}
        setTimeout(() => socket.onclose?.(), 0)
        return socket
      },
      onProblem: (p) => problems.push(p),
    })
    const stop = adapter.start(() => {})
    await until(() => problems.length > 0)
    expect(problems).toEqual(['cannot reach matterjs-server at ws://matter.test:5580/ws'])
    await stop()
  })

  test('a server too old for Funkloch is named', async () => {
    const { adapter, problems, stop } = started(true, createFakeMatterServer({ schemaVersion: 10 }))
    await until(() => problems.length > 0)
    expect(problems[0]).toMatch(/schema 10/)
    expect(adapter.status().connected).toBe(false)
    await stop()
  })
})
