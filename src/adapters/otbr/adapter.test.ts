import { describe, expect, test } from 'vitest'
import type { Observation } from '~/core/types'
import { createOtbrAdapter } from './adapter'
import { createFakeOtbr } from './fake'

const until = async (check: () => boolean) => {
  for (let i = 0; i < 200 && !check(); i++) await new Promise((r) => setTimeout(r, 5))
}

describe('OTBR adapter', () => {
  test('connects, reports its mode and emits observations', async () => {
    const otbr = createFakeOtbr()
    const modes: string[] = []
    const adapter = createOtbrAdapter({
      url: 'http://otbr.test:8081',
      fetcher: otbr.fetch,
      taskPollMs: 0,
      onMode: (mode) => modes.push(mode),
    })
    const observations: Observation[] = []
    expect(adapter.status().connected).toBe(false)
    const stop = adapter.start((o) => observations.push(o))
    await until(() => observations.some((o) => o.kind === 'channels'))
    expect(adapter.status()).toMatchObject({ connected: true, error: null })
    expect(modes).toEqual(['api'])
    expect(adapter.protocols.map((p) => p.id)).toEqual(['thread'])
    await stop()
  })

  test('an unreachable border router shows as an error', async () => {
    const otbr = createFakeOtbr()
    otbr.fail.set('/api/devices', 500)
    const problems: string[] = []
    const adapter = createOtbrAdapter({
      url: 'http://otbr.test:8081',
      fetcher: otbr.fetch,
      onProblem: (p) => problems.push(p),
    })
    const stop = adapter.start(() => {})
    await until(() => adapter.status().error !== null)
    expect(adapter.status()).toMatchObject({ connected: false, error: 'HTTP 500 for /api/devices' })
    expect(problems).toEqual(['HTTP 500 for /api/devices'])
    await stop()
  })

  test('a requested topology runs a cycle at once', async () => {
    const otbr = createFakeOtbr()
    const adapter = createOtbrAdapter({
      url: 'http://otbr.test:8081',
      fetcher: otbr.fetch,
      taskPollMs: 0,
    })
    const topologies: Observation[] = []
    const stop = adapter.start((o) => {
      if (o.kind === 'topology') topologies.push(o)
    })
    await until(() => topologies.length === 1)
    // the first cycle is still scanning the channels: the request runs right after it
    adapter.requestTopology?.('thread')
    await until(() => topologies.length === 2)
    expect(topologies).toHaveLength(2)
    await stop()
  })

  test('the border router counts as offline after three failed cycles, then back', async () => {
    const otbr = createFakeOtbr()
    const adapter = createOtbrAdapter({
      url: 'http://otbr.test:8081',
      fetcher: otbr.fetch,
      taskPollMs: 0,
      cycleMs: 10,
    })
    const bridge: boolean[] = []
    const stop = adapter.start((o) => {
      if (o.kind === 'bridge') bridge.push(o.online)
    })
    await until(() => bridge.length === 1)
    otbr.fail.set('/api/devices', 503)
    otbr.fail.set('/api/actions', 503)
    // the devices are due again only after 15 minutes: a requested map hits the failing actions
    for (let i = 0; i < 3; i++) {
      adapter.requestTopology?.('thread')
      await new Promise((r) => setTimeout(r, 20))
    }
    await until(() => bridge.length === 2)
    otbr.fail.clear()
    adapter.requestTopology?.('thread')
    await until(() => bridge.length === 3)
    expect(bridge).toEqual([true, false, true])
    await stop()
  })

  test('stopping does not wait for a running cycle, which then reports nothing', async () => {
    const otbr = createFakeOtbr()
    let answer = () => {}
    const held = new Promise<void>((resolve) => {
      answer = resolve
    })
    // The border router takes its time with the first answer
    const fetcher = (async (input: RequestInfo | URL, init?: RequestInit) => {
      await held
      return otbr.fetch(input, init)
    }) as typeof fetch
    const adapter = createOtbrAdapter({ url: 'http://otbr.test:8081', fetcher, taskPollMs: 0 })
    const observations: Observation[] = []
    const stop = adapter.start((o) => observations.push(o))
    await stop()
    answer()
    await new Promise((r) => setTimeout(r, 50))
    expect(observations).toEqual([])
  })
})
