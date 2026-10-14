// The Matter adapter: holds matterjs-server's nodes over one WebSocket and, every few minutes, reads
// the attributes devices do not report by themselves (nodes.ts pollPaths), one node at a time.
// It never writes, invokes or commissions anything.
import { z } from 'zod'
import type { Observation } from '~/core/types'
import { MINUTE } from '~/core/types'
import { threadMeta } from '../otbr/meta'
import type { Adapter, AdapterStatus } from '../types'
import { createNodeCache, type NodeCache } from './cache'
import { connectMatter, type MatterClient, type Socket, wsUrl } from './client'
import { wifiMeta } from './meta'
import { deviceInfoOf, type MatterNode, toNode } from './nodes'
import { attributeUpdateSchema, nodeSchema, serverInfoSchema } from './schemas'
import { createBackoff, createPoller, createReporter } from './session'
import { deviceObservations, nodeObservations } from './translate'

/** The oldest schema whose answers Funkloch reads (matterjs-server supports 11 and up) */
export const MIN_SCHEMA = 11

export type MatterOptions = {
  url: string
  pollMinutes: number
  /**
   * false while the OTBR adapter is on: it measures and maps Thread, and Matter only adds names,
   * makers, battery and reachability, so the map does not switch between two views of the mesh
   */
  threadSignal: boolean
  openSocket?: (url: string) => Socket
  now?: () => number
  onProblem?: (message: string) => void
  onConnected?: (info: { schemaVersion: number; sdk: string | null }) => void
}

const nodesSchema = z.array(nodeSchema)

/** PowerSource BatPercentRemaining counts half percent */
const batteryOfUpdate = (path: string, value: unknown) =>
  path.endsWith('/47/12') && typeof value === 'number' ? Math.round(value / 2) : null

/**
 * A server event into the cache, and what it says: a node's description and reachability, or for
 * an attribute report a sign of life (and its battery level).
 */
export const applyEvent = (
  cache: NodeCache,
  event: string,
  data: unknown,
  ts: number,
): Observation[] => {
  if (event === 'node_added' || event === 'node_updated') {
    const parsed = nodeSchema.safeParse(data)
    if (!parsed.success) return []
    const node = toNode(parsed.data)
    cache.put(node)
    return nodeObservations([node], ts)
  }
  if (event === 'node_removed') {
    cache.remove(String(data))
    return []
  }
  if (event !== 'attribute_updated') return []
  const parsed = attributeUpdateSchema.safeParse(data)
  if (!parsed.success) return []
  const [nodeId, path, value] = parsed.data
  const node = cache.update(String(nodeId), { [path]: value }, ts)
  const info = node && deviceInfoOf(node)
  if (!node || !info) return []
  const seen: Observation = {
    kind: 'seen',
    protocol: info.protocol,
    address: info.address,
    ts,
    battery: batteryOfUpdate(path, value),
  }
  const renamed = path.startsWith('0/40/') || path === '0/53/1'
  return renamed ? [seen, ...deviceObservations([node], ts)] : [seen]
}

type Listened =
  | { ok: true; nodes: MatterNode[]; info: { schemaVersion: number; sdk: string | null } }
  | { ok: false; error: string | null }

/** Checks the server info and lists the nodes; from then on the server sends events */
const startListening = async (connection: MatterClient, message: unknown): Promise<Listened> => {
  const info = serverInfoSchema.safeParse(message)
  if (!info.success) return { ok: false, error: null }
  const version = info.data.schema_version
  if (version < MIN_SCHEMA)
    return {
      ok: false,
      error: `matterjs-server speaks schema ${version}, Funkloch needs ${MIN_SCHEMA}+`,
    }
  const listed = await connection.request('start_listening', nodesSchema)
  if (!listed.ok) return listed
  return {
    ok: true,
    nodes: listed.value.map(toNode),
    info: { schemaVersion: version, sdk: info.data.sdk_version ?? null },
  }
}

export const createMatterAdapter = (options: MatterOptions): Adapter => {
  const now = options.now ?? Date.now
  const protocols = options.threadSignal ? [threadMeta, wifiMeta] : [wifiMeta]
  let status: AdapterStatus = { connected: false, error: null, since: null }
  let requestTopology = () => {}

  const problem = (message: string) => {
    if (status.error !== message) options.onProblem?.(message)
    status = { ...status, error: message }
  }

  const start = (emitObservation: (observation: Observation) => void) => {
    let stopped = false
    let client: MatterClient | null = null
    const emit = (observations: readonly Observation[]) => {
      if (!stopped) for (const observation of observations) emitObservation(observation)
    }
    const cache = createNodeCache()
    const report = createReporter(protocols, emit, now)
    const poller = createPoller({
      cache,
      now,
      pollMinutes: options.pollMinutes,
      threadSignal: options.threadSignal,
      emit,
      problem,
      connection: () => (stopped ? null : client),
    })

    const listen = async (connection: MatterClient, message: unknown) => {
      const listed = await startListening(connection, message)
      if (!listed.ok) {
        if (listed.error) problem(listed.error)
        return false
      }
      if (stopped || connection !== client) return false
      status = { connected: true, error: null, since: now() }
      options.onConnected?.(listed.info)
      const ts = now()
      cache.reset(listed.nodes)
      report.bridge(true)
      emit(nodeObservations(cache.all(), ts))
      report.reachability(cache, ts)
      return true
    }

    const reconnect = createBackoff(() => connect())
    /** The connection is gone or of no use: offline, and try again later */
    const lost = (connection: MatterClient) => {
      client = null
      connection.close()
      if (status.connected) status = { connected: false, error: status.error, since: now() }
      report.bridge(false)
      if (!stopped) reconnect.schedule()
    }
    const connect = () => {
      if (stopped) return
      const connection: MatterClient = connectMatter(
        options.url,
        {
          onServerInfo: (message) => {
            if (connection !== client) return
            void listen(connection, message).then((ok) => {
              if (ok) {
                reconnect.reset()
                poller.run()
              } else if (connection === client) lost(connection)
            })
          },
          onEvent: (event, data) => {
            if (connection !== client) return
            emit(applyEvent(cache, event, data, now()))
            if (event === 'node_added' || event === 'node_updated')
              report.reachability(cache, now())
          },
          onClose: () => {
            if (connection !== client) return
            problem(
              status.connected
                ? 'connection to matterjs-server lost'
                : `cannot reach matterjs-server at ${wsUrl(options.url)}`,
            )
            lost(connection)
          },
        },
        options.openSocket,
      )
      client = connection
    }

    requestTopology = poller.run
    connect()
    const pollTimer = setInterval(poller.run, options.pollMinutes * MINUTE)

    return async () => {
      stopped = true
      requestTopology = () => {}
      clearInterval(pollTimer)
      reconnect.cancel()
      const connection = client
      client = null
      connection?.close()
    }
  }

  return {
    id: 'matter',
    label: 'Matter',
    protocols,
    start,
    status: () => status,
    requestTopology: () => requestTopology(),
  }
}
