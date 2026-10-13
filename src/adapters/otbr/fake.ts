// A border router for tests: answers the REST resources Funkloch reads from the spec fixtures
// (tests/fixtures/otbr-spec). Tasks complete on the first look.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const fixture = (name: string) =>
  JSON.parse(
    readFileSync(join(import.meta.dirname, '../../../tests/fixtures/otbr-spec', name), 'utf8'),
  )

type Item = { id: string; type: string; attributes: Record<string, unknown> }

export type FakeOtbr = {
  fetch: typeof fetch
  /** Every request as "METHOD /path" */
  requests: string[]
  /** Answer these paths with a status instead */
  fail: Map<string, number>
  /** Tasks of these types end as "failed" */
  failTasks: Set<string>
}

/** The numeric attributes each task requires (src/rest/actions/*.cpp Validate) */
const REQUIRED: Record<string, string[]> = {
  updateDeviceCollectionTask: ['maxAge', 'maxRetries', 'deviceCount', 'timeout'],
  getNetworkDiagnosticTask: ['timeout'],
  getEnergyScanTask: ['timeout', 'count', 'period', 'scanDuration'],
}

const valid = (task: Item) =>
  (REQUIRED[task.type] ?? []).every((key) => typeof task.attributes[key] === 'number')

export const createFakeOtbr = (variant: 'api' | 'legacy' = 'api'): FakeOtbr => {
  const devices = fixture('devices.json')
  const diagnostics: Item[] = fixture('diagnostics.json').data
  const legacy = variant === 'legacy' ? fixture('legacy-diagnostics.json') : null
  const actions = new Map<string, Item & { relationships?: unknown }>()
  const requests: string[] = []
  const fail = new Map<string, number>()
  const failTasks = new Set<string>()

  const resultOf = (task: Item) => {
    if (task.type === 'getNetworkDiagnosticTask') {
      return diagnostics.find(
        (d) =>
          d.type === 'networkDiagnostics' &&
          d.attributes.extAddress === task.attributes.destination,
      )
    }
    if (task.type === 'getEnergyScanTask')
      return diagnostics.find((d) => d.type === 'energyScanReport')
    return undefined
  }

  const handle = async (request: Request) => {
    const { pathname } = new URL(request.url)
    requests.push(`${request.method} ${pathname}`)
    const failed = fail.get(pathname)
    if (failed) return new Response('failed', { status: failed })
    if (variant === 'legacy') {
      if (pathname === '/diagnostics') return Response.json(legacy)
      if (pathname === '/node') return Response.json({ ExtAddress: '96518E5497D5B9F3', State: 4 })
      if (pathname === '/node/dataset/active') return Response.json({ Channel: 15 })
      return new Response('Not Found', { status: 404 })
    }
    if (pathname === '/api/devices') return Response.json(devices)
    if (pathname === '/node/dataset/active')
      return Response.json({ channel: 25, networkKey: 'secret' })
    if (pathname === '/api/actions' && request.method === 'POST') {
      if (request.headers.get('content-type') !== 'application/vnd.api+json')
        return new Response('Unsupported Media Type', { status: 415 })
      const body = (await request.json()) as { data: Item[] }
      // The whole list is refused when one task lacks a required attribute (rest_web_server.cpp)
      if (!body.data.every(valid)) return new Response('Unprocessable', { status: 422 })
      const items = body.data.map((task) => {
        const id = crypto.randomUUID()
        const failed = failTasks.has(task.type)
        const result = failed ? undefined : resultOf(task)
        const item = {
          id,
          type: task.type,
          attributes: { ...task.attributes, status: failed ? 'failed' : 'completed' },
          ...(result
            ? { relationships: { result: { data: { id: result.id, type: result.type } } } }
            : {}),
        }
        actions.set(id, item)
        return { ...item, attributes: { ...item.attributes, status: 'pending' } }
      })
      return Response.json({ data: items })
    }
    const action = pathname.match(/^\/api\/actions\/(.+)$/)
    if (action) {
      const item = actions.get(action[1] ?? '')
      return item ? Response.json({ data: item }) : new Response('Not Found', { status: 404 })
    }
    const diagnostic = pathname.match(/^\/api\/diagnostics\/(.+)$/)
    if (diagnostic) {
      const item = diagnostics.find((d) => d.id === diagnostic[1])
      return item ? Response.json({ data: item }) : new Response('Not Found', { status: 404 })
    }
    return new Response('Not Found', { status: 404 })
  }

  return {
    fetch: ((input: RequestInfo | URL, init?: RequestInit) =>
      handle(new Request(input, init))) as typeof fetch,
    requests,
    fail,
    failTasks,
  }
}
