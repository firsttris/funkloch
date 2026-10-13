// A border router for tests: answers the REST resources Funkloch reads from the fixtures
// (tests/fixtures/otbr-spec) and is as strict as ot-br-posix (main, 65a0ce9) about headers and
// task attributes. Tasks complete on the first look.
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

const JSON_API = 'application/vnd.api+json'

/**
 * The border router compares the Accept header of /api requests as one string with these
 * (src/rest/rest_web_server.cpp; an absent header arrives as "*\/*") and answers 406 otherwise.
 */
const ACCEPTED = ['*/*', JSON_API, 'application/json']

/** The names getNetworkDiagnosticTask accepts in "types" (src/rest/diagnostic_types.hpp) */
const DIAGNOSTIC_TYPES = new Set([
  'extAddress',
  'rloc16',
  'mode',
  'timeout',
  'connectivity',
  'route',
  'leaderData',
  'networkData',
  'ipv6Addresses',
  'macCounters',
  'batteryLevel',
  'supplyVoltage',
  'childTable',
  'channelPages',
  'maxChildTimeout',
  'lDevIdSubject',
  'iDevIdCert',
  'eui',
  'threadVersion',
  'vendorName',
  'vendorModel',
  'vendorSwVersion',
  'threadStackVersion',
  'children',
  'childIpv6Addresses',
  'routerNeighbors',
  'mleCounters',
])

const isNumber = (value: unknown) => typeof value === 'number'

/** An extended address (16 hex digits) or an RLOC16 like "0x5000" (action.cpp ReadDestination) */
const isDestination = (value: unknown) =>
  typeof value === 'string' && (value.length === 16 || value.length === 6)

const isChannelMask = (value: unknown) =>
  Array.isArray(value) && value.every((c) => isNumber(c) && c >= 11 && c <= 26)

const isTypeList = (value: unknown) =>
  Array.isArray(value) && value.every((t) => typeof t === 'string' && DIAGNOSTIC_TYPES.has(t))

/** Each task's Validate in src/rest/actions/*.cpp; an unknown task is invalid */
const VALIDATE: Record<string, (a: Record<string, unknown>) => boolean> = {
  updateDeviceCollectionTask: (a) =>
    isNumber(a.maxAge) && isNumber(a.maxRetries) && isNumber(a.deviceCount) && isNumber(a.timeout),
  getNetworkDiagnosticTask: (a) =>
    isNumber(a.timeout) && isDestination(a.destination) && isTypeList(a.types),
  getEnergyScanTask: (a) =>
    isNumber(a.timeout) &&
    isDestination(a.destination) &&
    isChannelMask(a.channelMask) &&
    isNumber(a.count) &&
    isNumber(a.period) &&
    isNumber(a.scanDuration),
}

const valid = (task: Item) =>
  typeof task.attributes === 'object' && (VALIDATE[task.type]?.(task.attributes) ?? false)

export const createFakeOtbr = (variant: 'api' | 'legacy' = 'api'): FakeOtbr => {
  const devices = fixture('devices.json')
  const deviceIds = new Set((devices.data as Item[]).map((d) => d.id))
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
    if (pathname.startsWith('/api/') && !ACCEPTED.includes(request.headers.get('accept') ?? '*/*'))
      return new Response('Not Acceptable', { status: 406 })
    if (pathname === '/api/devices') return Response.json(devices)
    if (pathname === '/node/dataset/active')
      return Response.json({ channel: 25, networkKey: 'secret' })
    if (pathname === '/api/actions' && request.method === 'POST') {
      const contentType = request.headers.get('content-type')
      if (!contentType) return new Response('Not Acceptable', { status: 406 })
      if (contentType !== JSON_API) return new Response('Unsupported Media Type', { status: 415 })
      const body = (await request.json()) as { data: Item[] }
      // The whole list is refused when one task lacks a required attribute (rest_web_server.cpp)
      if (!body.data.every(valid)) return new Response('Unprocessable', { status: 422 })
      const items = body.data.map((task) => {
        const id = crypto.randomUUID()
        // An extended address must name a device of the collection (services.cpp LookupAddress)
        const unknown =
          typeof task.attributes.destination === 'string' &&
          task.attributes.destination.length === 16 &&
          !deviceIds.has(task.attributes.destination)
        const failed = failTasks.has(task.type) || unknown
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
