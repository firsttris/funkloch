import { describe, expect, test } from 'vitest'
import type { Observation } from '~/core/types'
import { HOUR, MINUTE } from '~/core/types'
import { createOtbrClient } from './client'
import { createFakeOtbr } from './fake'
import { createOtbrPoll } from './poll'

const setup = (variant: 'api' | 'legacy' = 'api') => {
  const otbr = createFakeOtbr(variant)
  const observations: Observation[] = []
  const problems: string[] = []
  let time = Date.UTC(2026, 9, 13, 6)
  const poll = createOtbrPoll({
    client: createOtbrClient('http://otbr.test:8081', otbr.fetch),
    emit: (o) => observations.push(o),
    now: () => time,
    taskPollMs: 0,
    onProblem: (message) => problems.push(message),
  })
  const take = () => observations.splice(0)
  const of = <K extends Observation['kind']>(list: Observation[], kind: K) =>
    list.filter((o): o is Extract<Observation, { kind: K }> => o.kind === kind)
  return {
    otbr,
    poll,
    problems,
    take,
    of,
    advance: (ms: number) => {
      time += ms
    },
  }
}

describe('OTBR poll, REST API under /api', () => {
  test('the first cycle reads devices, channel, measurements, topology and the energy scan', async () => {
    const { poll, take, of, problems } = setup()
    expect(await poll.cycle()).toEqual({ ok: true, value: 'api' })
    const out = take()

    const [devices] = of(out, 'devices')
    expect(devices?.complete).toBe(false)
    expect(devices?.devices.map((d) => [d.address, d.role])).toEqual([
      ['96518e5497d5b9f3', 'border_router'],
      ['2a55d952bc7b4008', 'router'],
      ['f2f307043724e8d0', 'sleepy_end_device'],
      ['0011223344556677', 'end_device'],
    ])
    expect(of(out, 'channel')).toEqual([{ kind: 'channel', protocol: 'thread', channel: 25 }])

    const measured = of(out, 'measurement').map((m) => m.measurement.address)
    expect(measured.sort()).toEqual(['0011223344556677', '2a55d952bc7b4008', 'f2f307043724e8d0'])

    const [topology] = of(out, 'topology')
    const parents = topology?.topology.links.filter((l) => l.parent).map((l) => [l.from, l.to])
    expect(parents).toContainEqual(['f2f307043724e8d0', '2a55d952bc7b4008'])
    expect(parents).toContainEqual(['2a55d952bc7b4008', '96518e5497d5b9f3'])

    const [scan] = of(out, 'channels')
    expect(scan?.channels.length).toBeGreaterThan(0)
    expect(problems).toEqual([])
  })

  test('each router answers its MAC counters, read as transmit counters', async () => {
    const { poll, take, of } = setup()
    await poll.cycle()
    const counters = of(take(), 'counters').map((o) => o.counters)
    expect(counters.map((c) => [c.address, c.unicast, c.broadcast, c.errors])).toEqual([
      ['96518e5497d5b9f3', 6, 926, 0],
      ['2a55d952bc7b4008', 9702, 3998, 1326],
    ])
  })

  test('each part waits for its interval; a requested topology comes at once', async () => {
    const { poll, take, of, otbr, advance } = setup()
    await poll.cycle()
    take()
    otbr.requests.length = 0

    advance(MINUTE)
    await poll.cycle()
    expect(take()).toEqual([])
    expect(otbr.requests).toEqual([])

    advance(5 * MINUTE)
    await poll.cycle()
    const out = take()
    expect(of(out, 'measurement').length).toBe(3)
    expect(of(out, 'topology')).toEqual([])
    expect(of(out, 'devices')).toEqual([])

    poll.requestTopology()
    await poll.cycle()
    expect(of(take(), 'topology')).toHaveLength(1)

    advance(HOUR)
    await poll.cycle()
    const hourly = take()
    expect(of(hourly, 'topology')).toHaveLength(1)
    expect(of(hourly, 'devices')).toHaveLength(1)
  })

  test('diagnostics go to routers only, never to sleepy devices', async () => {
    const { poll, otbr } = setup()
    await poll.cycle()
    const posted = otbr.requests.filter((r) => r === 'POST /api/actions')
    // device collection, diagnostics, energy scan
    expect(posted).toHaveLength(3)
  })

  test('an unreachable border router is an error, not an exception', async () => {
    const { poll, otbr, take } = setup()
    otbr.fail.set('/api/devices', 503)
    const result = await poll.cycle()
    expect(result).toEqual({ ok: false, status: 503, error: 'HTTP 503 for /api/devices' })
    expect(take()).toEqual([])
  })

  test('a failed energy scan is only a problem; the rest still arrives', async () => {
    const { poll, otbr, take, of, problems } = setup()
    otbr.failTasks.add('getEnergyScanTask')
    expect((await poll.cycle()).ok).toBe(true)
    const out = take()
    expect(of(out, 'channels')).toEqual([])
    expect(of(out, 'measurement')).toHaveLength(3)
    expect(problems).toEqual(['energy scan: no report'])
  })

  test('a failed device collection update still reads the collection', async () => {
    const { poll, otbr, take, of } = setup()
    otbr.failTasks.add('updateDeviceCollectionTask')
    await poll.cycle()
    expect(of(take(), 'devices')).toHaveLength(1)
  })

  test('without a border router answer the next cycle detects again', async () => {
    const { poll, otbr } = setup()
    otbr.fail.set('/api/devices', 502)
    expect((await poll.cycle()).ok).toBe(false)
    otbr.fail.clear()
    expect(await poll.cycle()).toEqual({ ok: true, value: 'api' })
  })

  test('the network key in the dataset is never passed on', async () => {
    const { poll, take } = setup()
    await poll.cycle()
    expect(JSON.stringify(take())).not.toContain('secret')
  })
})

describe('OTBR poll, older images with /diagnostics', () => {
  test('falls back when /api is missing: devices, signs of life and links, no measurements', async () => {
    const { poll, take, of } = setup('legacy')
    expect(await poll.cycle()).toEqual({ ok: true, value: 'legacy' })
    const out = take()
    const [devices] = of(out, 'devices')
    expect(devices?.devices.map((d) => [d.address, d.role])).toEqual([
      ['96518e5497d5b9f3', 'border_router'],
      ['2a55d952bc7b4008', 'router'],
      ['f2f307043724e8d0', 'sleepy_end_device'],
    ])
    expect(of(out, 'seen')).toHaveLength(3)
    expect(of(out, 'measurement')).toEqual([])
    expect(of(out, 'channel')).toEqual([{ kind: 'channel', protocol: 'thread', channel: 15 }])
    const links = of(out, 'topology')[0]?.topology.links ?? []
    expect(links).toContainEqual({
      from: 'f2f307043724e8d0',
      to: '2a55d952bc7b4008',
      lqi: null,
      rssi: null,
      parent: true,
    })
    expect(links.filter((l) => !l.parent).length).toBeGreaterThan(0)
  })
})
