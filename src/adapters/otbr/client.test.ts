import { describe, expect, test } from 'vitest'
import { z } from 'zod'
import { createOtbrClient } from './client'

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
