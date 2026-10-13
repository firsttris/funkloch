import { afterEach, describe, expect, test, vi } from 'vitest'
import { z } from 'zod'
import { createOtbrClient, runTasks } from './client'

const recordAccept = () => {
  const accepts = new Map<string, string | null>()
  const fetcher = (async (input: URL | RequestInfo, init?: RequestInit) => {
    accepts.set(new URL(String(input)).pathname, new Headers(init?.headers).get('accept'))
    return new Response('{}', { status: 200 })
  }) as typeof fetch
  return { accepts, client: createOtbrClient('http://otbr.test:8081', fetcher) }
}

describe('OTBR client', () => {
  test('sends exactly one media type in Accept, as the border router demands', async () => {
    const { accepts, client } = recordAccept()
    await client.get('/api/devices', z.unknown())
    await client.get('/node', z.unknown())
    expect(accepts.get('/api/devices')).toBe('application/vnd.api+json')
    expect(accepts.get('/node')).toBe('application/json')
  })
})

describe('runTasks', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  test('waits for tasks the border router runs one after the other', async () => {
    vi.useFakeTimers()
    const start = Date.now()
    // Each task takes 25 s and starts when the one before it is done
    const doneAt: Record<string, number> = { a: start + 25_000, b: start + 50_000 }
    const fetcher = (async (input: URL | RequestInfo, init?: RequestInit) => {
      const id = new URL(String(input)).pathname.split('/')[3]
      if (init?.method === 'POST')
        return Response.json({
          data: ['a', 'b'].map((id) => ({ id, type: 'task', attributes: { status: 'pending' } })),
        })
      const status = Date.now() >= (doneAt[id ?? ''] ?? 0) ? 'completed' : 'active'
      return Response.json({ data: { id, type: 'task', attributes: { status } } })
    }) as typeof fetch
    const client = createOtbrClient('http://otbr.test:8081', fetcher)
    const task = { type: 'task', attributes: {} }
    const running = runTasks(client, [task, task], 30, 1000)
    await vi.advanceTimersByTimeAsync(80_000)
    const result = await running
    expect(result.ok && result.value.map((t) => t.id)).toEqual(['a', 'b'])
  })
})
