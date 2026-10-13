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
    expect(adapter.meta.id).toBe('thread')
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
    adapter.requestTopology?.()
    await until(() => topologies.length === 2)
    expect(topologies).toHaveLength(2)
    await stop()
  })
})
