// Records what an OpenThread Border Router's REST API answers. Paths and task types follow
// ot-br-posix src/rest/rest_web_server.cpp and src/rest/openapi.yaml; older images (Home Assistant
// add-on) only know the /node/* resources and /diagnostics, so every path is tried and a 404 is
// recorded as an answer too.
import { redactBody } from './redact'

export type OtbrRecord = {
  ts: string
  method: 'GET' | 'POST'
  path: string
  request?: unknown
  status: number | null
  contentType: string | null
  body: unknown
  error?: string
}

/** Read-only resources, asked once at the start and again at every poll. */
export const NODE_PATHS = [
  '/node',
  '/node/state',
  '/node/rloc16',
  '/node/ext-address',
  '/node/network-name',
  '/node/leader-data',
  '/node/num-of-router',
  '/node/ext-panid',
  '/node/ba-id',
  '/node/coprocessor/version',
  '/node/dataset/active',
  // not in ot-br-posix, but named in the plan: recorded to confirm what the image answers
  '/node/neighbors',
  // removed upstream, still present in older images
  '/diagnostics',
]

export const API_PATHS = [
  '/.well-known/thread/br-rest',
  '/api/node',
  '/api/devices',
  '/api/diagnostics',
  '/api/actions',
]

/** Everything a device answers that tells something about its links. */
export const DIAGNOSTIC_TYPES = [
  'extAddress',
  'rloc16',
  'mode',
  'connectivity',
  'route',
  'leaderData',
  'macCounters',
  'mleCounters',
  'childTable',
  'children',
  'routerNeighbors',
  'batteryLevel',
  'supplyVoltage',
  'eui',
  'threadVersion',
  'vendorName',
  'vendorModel',
  'vendorSwVersion',
  'threadStackVersion',
]

const JSON_API = 'application/vnd.api+json'

const readBody = async (response: Response) => {
  const text = await response.text()
  try {
    return JSON.parse(text) as unknown
  } catch {
    return text
  }
}

export const createOtbrClient = (baseUrl: string, write: (record: OtbrRecord) => void) => {
  const call = async (method: 'GET' | 'POST', path: string, request?: unknown) => {
    const ts = new Date().toISOString()
    try {
      const response = await fetch(new URL(path, baseUrl), {
        method,
        headers: {
          accept: path.startsWith('/api/') ? `${JSON_API}, application/json` : 'application/json',
          ...(request ? { 'content-type': JSON_API } : {}),
        },
        body: request ? JSON.stringify(request) : undefined,
        signal: AbortSignal.timeout(30_000),
      })
      const body = redactBody(path, await readBody(response))
      const contentType = response.headers.get('content-type')
      write({ ts, method, path, request, status: response.status, contentType, body })
      return { status: response.status, body }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      write({
        ts,
        method,
        path,
        request,
        status: null,
        contentType: null,
        body: null,
        error: message,
      })
      return { status: null, body: null }
    }
  }
  return {
    get: (path: string) => call('GET', path),
    post: (path: string, request: unknown) => call('POST', path, request),
  }
}

export type OtbrClient = ReturnType<typeof createOtbrClient>

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

type TaskItem = { id?: string; type?: string; attributes?: { status?: string } }

const taskItems = (body: unknown): TaskItem[] => {
  const data = (body as { data?: unknown } | null)?.data
  return Array.isArray(data) ? (data as TaskItem[]) : []
}

const DONE = new Set(['completed', 'stopped', 'failed'])

/** Posts tasks to /api/actions and polls each until it is done or its time is up. */
export const runTasks = async (client: OtbrClient, tasks: unknown[], timeoutSeconds: number) => {
  const { status, body } = await client.post('/api/actions', { data: tasks })
  if (status !== 200) return
  const ids = taskItems(body).flatMap((item) => (item.id ? [item.id] : []))
  const deadline = Date.now() + (timeoutSeconds + 15) * 1000
  const pending = new Set(ids)
  while (pending.size > 0 && Date.now() < deadline) {
    await sleep(3000)
    for (const id of [...pending]) {
      const result = await client.get(`/api/actions/${id}`)
      const state = (result.body as { data?: TaskItem } | null)?.data?.attributes?.status
      if (state && DONE.has(state)) pending.delete(id)
    }
  }
}

const deviceIds = (body: unknown) =>
  taskItems(body).flatMap((item) => (typeof item.id === 'string' ? [item.id] : []))

/** One round: the read-only resources, then, where /api exists, a fresh topology and diagnostics. */
export const pollOtbr = async (
  client: OtbrClient,
  options: { actions: boolean; energyScan: boolean },
) => {
  for (const path of [...NODE_PATHS, ...API_PATHS]) await client.get(path)
  if (!options.actions) return

  const wellKnown = await client.get('/.well-known/thread/br-rest')
  if (wellKnown.status !== 200) return

  await runTasks(
    client,
    [
      {
        type: 'updateDeviceCollectionTask',
        attributes: { maxAge: 30, maxRetries: 5, deviceCount: 64, timeout: 60 },
      },
    ],
    60,
  )
  const devices = await client.get('/api/devices')
  const diagnostics = deviceIds(devices.body).map((destination) => ({
    type: 'getNetworkDiagnosticTask',
    attributes: { destination, types: DIAGNOSTIC_TYPES, timeout: 60 },
  }))
  if (diagnostics.length > 0) await runTasks(client, diagnostics, 60)

  if (options.energyScan) {
    const borderRouter = taskItems(devices.body).find(
      (item) => item.type === 'threadBorderRouter',
    )?.id
    await runTasks(
      client,
      [
        {
          type: 'getEnergyScanTask',
          attributes: {
            ...(borderRouter ? { destination: borderRouter } : {}),
            channelMask: [11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26],
            count: 3,
            period: 32,
            scanDuration: 50,
            timeout: 60,
          },
        },
      ],
      60,
    )
  }
  await client.get('/api/diagnostics')
}
