// One polling cycle against the OTBR REST API. The adapter runs it every minute; each part has its
// own interval and runs when it is due. Newer images (ot-br-posix src/rest/openapi.yaml) answer
// under /api with tasks in /api/actions; older ones (Home Assistant add-on) only have /node and
// /diagnostics, which carry link qualities but no RSSI.
import { CHANNELS } from '~/core/channels'
import type { DeviceInfo, Observation } from '~/core/types'
import { HOUR, MINUTE } from '~/core/types'
import { type OtbrClient, type Result, runTasks } from './client'
import { threadMeta } from './meta'
import {
  type DeviceItem,
  datasetSchema,
  devicesSchema,
  diagnosticItemSchema,
  type EnergyScan,
  legacyDiagnosticsSchema,
  type NetworkDiagnostic,
  nodeSchema,
} from './schemas'
import { fromDiagnostics, fromEnergyScan, fromLegacyDiagnostics, toDeviceInfo } from './translate'

const PROTOCOL = threadMeta.id

export const INTERVALS = {
  devices: 15 * MINUTE,
  diagnostics: 5 * MINUTE,
  topology: HOUR,
  scan: 6 * HOUR,
}

const DIAGNOSTIC_TIMEOUT = 30
const COLLECTION_TIMEOUT = 60
const SCAN_TIMEOUT = 120

type Part = keyof typeof INTERVALS
type Mode = 'api' | 'legacy'

export type PollDeps = {
  client: OtbrClient
  emit: (observation: Observation) => void
  now: () => number
  /** Milliseconds between two looks at a pending task */
  taskPollMs?: number
  /** Problems that do not stop the cycle, e.g. a failed energy scan */
  onProblem?: (message: string) => void
}

const ok: Result<void> = { ok: true, value: undefined }

const due = (last: number | null, every: number, now: number) =>
  last === null || now - last >= every

/** The item id is the extended address (openapi.yaml deviceId); other items are skipped */
const hasAddress = (item: DeviceItem) =>
  Boolean(item.attributes.extAddress) || /^[0-9a-f]{16}$/i.test(item.id)

const isRouter = (device: DeviceInfo) => device.role === 'router' || device.role === 'border_router'

export const createOtbrPoll = (deps: PollDeps) => {
  const { client, emit, now } = deps
  let mode: Mode | null = null
  let known: DeviceInfo[] = []
  let selfAddress: string | null = null
  const last: Record<Part, number | null> = {
    devices: null,
    diagnostics: null,
    topology: null,
    scan: null,
  }
  let topologyWanted = false

  /** /api/devices answers on newer images; on older ones only /diagnostics does */
  const detect = async (): Promise<Result<Mode>> => {
    const api = await client.get('/api/devices', devicesSchema)
    if (api.ok) return { ok: true, value: 'api' }
    if (api.status !== 404) return api
    const legacy = await client.get('/diagnostics', legacyDiagnosticsSchema)
    return legacy.ok ? { ok: true, value: 'legacy' } : legacy
  }

  const emitChannel = async () => {
    const dataset = await client.get('/node/dataset/active', datasetSchema)
    if (dataset.ok && dataset.value.Channel !== undefined) {
      emit({ kind: 'channel', protocol: PROTOCOL, channel: dataset.value.Channel })
    }
  }

  const emitDevices = (devices: DeviceInfo[], ts: number) => {
    known = devices
    emit({ kind: 'devices', protocol: PROTOCOL, ts, devices, complete: false })
  }

  const topologyDue = (ts: number) => topologyWanted || due(last.topology, INTERVALS.topology, ts)

  const emitTopology = (links: ReturnType<typeof fromDiagnostics>['links'], ts: number) => {
    emit({ kind: 'topology', topology: { protocol: PROTOCOL, ts, links } })
    last.topology = ts
    topologyWanted = false
  }

  /** Asks the border router to refresh its device collection, then reads it */
  const refreshDevices = async (ts: number): Promise<Result<void>> => {
    const update = await runTasks(
      client,
      [
        {
          type: 'updateDeviceCollectionTask',
          attributes: {
            maxAge: 30,
            maxRetries: 5,
            deviceCount: Math.max(10, known.length + 5),
            timeout: COLLECTION_TIMEOUT,
          },
        },
      ],
      COLLECTION_TIMEOUT,
      deps.taskPollMs,
    )
    if (!update.ok) deps.onProblem?.(`device collection update: ${update.error}`)
    const result = await client.get('/api/devices', devicesSchema)
    if (!result.ok) return result
    emitDevices(result.value.data.filter(hasAddress).map(toDeviceInfo), ts)
    await emitChannel()
    last.devices = ts
    return ok
  }

  /** Runs tasks and reads the diagnostics items they produced */
  const taskResults = async (
    tasks: { type: string; attributes: Record<string, unknown> }[],
    timeout: number,
  ) => {
    const finished = await runTasks(client, tasks, timeout, deps.taskPollMs)
    if (!finished.ok) return finished
    const items = await Promise.all(
      finished.value.flatMap((task) => {
        const id = task.relationships?.result?.data.id
        return task.attributes.status === 'completed' && id
          ? [client.get(`/api/diagnostics/${encodeURIComponent(id)}`, diagnosticItemSchema)]
          : []
      }),
    )
    return { ok: true as const, value: items.flatMap((item) => (item.ok ? [item.value.data] : [])) }
  }

  /** Neighbor and child tables of all routers: the measurements, and the topology when due */
  const readDiagnostics = async (ts: number): Promise<Result<void>> => {
    const routers = known.filter(isRouter)
    last.diagnostics = ts
    if (routers.length === 0) return ok
    const result = await taskResults(
      routers.map((router) => ({
        type: 'getNetworkDiagnosticTask',
        attributes: {
          destination: router.address,
          types: ['extAddress', 'rloc16', 'routerNeighbors', 'children'],
          timeout: DIAGNOSTIC_TIMEOUT,
        },
      })),
      DIAGNOSTIC_TIMEOUT,
    )
    if (!result.ok) return result
    const diagnostics = result.value.filter(
      (item): item is NetworkDiagnostic => item.type === 'threadNetworkDiagnostic',
    )
    if (diagnostics.length === 0) return ok
    const roots = new Set(known.filter((d) => d.role === 'border_router').map((d) => d.address))
    const { measurements, links } = fromDiagnostics(diagnostics, now(), roots)
    for (const measurement of measurements) emit({ kind: 'measurement', measurement })
    if (topologyDue(ts)) emitTopology(links, ts)
    return ok
  }

  /** Energy per channel as the border router hears it; a failure only skips this scan */
  const scanChannels = async (ts: number) => {
    last.scan = ts
    const self = known.find((d) => d.role === 'border_router')
    if (!self) return
    const result = await taskResults(
      [
        {
          type: 'getEnergyScanTask',
          attributes: { destination: self.address, channelMask: CHANNELS, timeout: SCAN_TIMEOUT },
        },
      ],
      SCAN_TIMEOUT,
    )
    if (!result.ok) return deps.onProblem?.(`energy scan: ${result.error}`)
    const scan = result.value.find((item): item is EnergyScan => item.type === 'energyScanReport')
    const channels = scan ? fromEnergyScan(scan) : []
    if (channels.length === 0) return deps.onProblem?.('energy scan: no report')
    emit({ kind: 'channels', protocol: PROTOCOL, ts, channels })
  }

  const apiCycle = async (ts: number): Promise<Result<void>> => {
    if (due(last.devices, INTERVALS.devices, ts)) {
      const devices = await refreshDevices(ts)
      if (!devices.ok) return devices
    }
    if (due(last.diagnostics, INTERVALS.diagnostics, ts) || topologyWanted) {
      const diagnostics = await readDiagnostics(ts)
      if (!diagnostics.ok) return diagnostics
    }
    if (due(last.scan, INTERVALS.scan, ts)) await scanChannels(ts)
    return ok
  }

  /** Older images: devices and links from /diagnostics, the border router from /node */
  const legacyCycle = async (ts: number): Promise<Result<void>> => {
    if (!(due(last.diagnostics, INTERVALS.diagnostics, ts) || topologyWanted)) return ok
    if (selfAddress === null) {
      const node = await client.get('/node', nodeSchema)
      if (node.ok && node.value.ExtAddress) selfAddress = node.value.ExtAddress.toLowerCase()
    }
    const result = await client.get('/diagnostics', legacyDiagnosticsSchema)
    if (!result.ok) return result
    last.diagnostics = ts
    const { devices, links } = fromLegacyDiagnostics(result.value)
    emitDevices(
      devices.map((d) => (d.address === selfAddress ? { ...d, role: 'border_router' } : d)),
      ts,
    )
    // A node that answers the diagnostics is alive
    for (const device of devices) {
      emit({ kind: 'seen', protocol: PROTOCOL, address: device.address, ts, battery: null })
    }
    if (topologyDue(ts)) emitTopology(links, ts)
    if (due(last.devices, INTERVALS.devices, ts)) {
      await emitChannel()
      last.devices = ts
    }
    return ok
  }

  /** One cycle; the result says whether the border router answered */
  const cycle = async (): Promise<Result<Mode>> => {
    if (mode === null) {
      const detected = await detect()
      if (!detected.ok) return detected
      mode = detected.value
    }
    const result = mode === 'api' ? await apiCycle(now()) : await legacyCycle(now())
    return result.ok ? { ok: true, value: mode } : result
  }

  return {
    cycle,
    /** The next cycle reads the topology, whatever its interval */
    requestTopology: () => {
      topologyWanted = true
    },
  }
}
