// The parts of one adapter run: the poll cycle, the bridge and reachability reports, and the wait
// before connecting again. Each is a closure over its own state; the adapter wires them together.
import { z } from 'zod'
import type { Observation } from '~/core/types'
import { MINUTE } from '~/core/types'
import type { ProtocolMeta } from '../types'
import type { NodeCache } from './cache'
import type { MatterClient } from './client'
import { pollPaths } from './nodes'
import { type BorderRouter, borderRouterSchema } from './schemas'
import { availabilityOf, cycleObservations } from './translate'

const RECONNECT_MIN = 5_000
const RECONNECT_MAX = 60_000
/** Polled values older than this many intervals are left out, e.g. of a device that sleeps */
const FRESH_FOR = 2

const attributesSchema = z.record(z.string(), z.unknown())

type Emit = (observations: readonly Observation[]) => void

/** Reads the polled attributes of every node, one after the other; the problems come back */
const readNodes = async (connection: MatterClient, cache: NodeCache, now: () => number) => {
  const problems: string[] = []
  for (const node of cache.all()) {
    const paths = pollPaths(node)
    if (paths.length === 0) continue
    const read = await connection.request('read_attribute', attributesSchema, {
      node_id: node.nodeId,
      attribute_path: paths,
    })
    if (read.ok) cache.update(node.id, read.value, now())
    else problems.push(read.error)
  }
  return problems
}

/** The border routers the server found over mDNS; a passive list, no radio traffic */
const readBorderRouters = async (connection: MatterClient): Promise<BorderRouter[] | null> => {
  const answer = await connection.request('get_thread_border_routers', z.array(z.unknown()))
  if (!answer.ok) return null
  return answer.value.flatMap((item) => {
    const parsed = borderRouterSchema.safeParse(item)
    return parsed.success ? [parsed.data] : []
  })
}

export type PollerDeps = {
  cache: NodeCache
  now: () => number
  pollMinutes: number
  threadSignal: boolean
  emit: Emit
  problem: (message: string) => void
  /** The connection to poll over, null while there is none or the adapter stopped */
  connection: () => MatterClient | null
}

/** One poll at a time; a request during a poll runs once it is done */
export const createPoller = (deps: PollerDeps) => {
  let borderRouters: BorderRouter[] = []
  let cycle: Promise<void> | null = null
  let again = false

  const poll = async (connection: MatterClient) => {
    const problems = await readNodes(connection, deps.cache, deps.now)
    if (deps.threadSignal) borderRouters = (await readBorderRouters(connection)) ?? borderRouters
    if (connection !== deps.connection()) return
    for (const message of problems) deps.problem(message)
    const ts = deps.now()
    const fresh = deps.cache.freshSince(ts - FRESH_FOR * deps.pollMinutes * MINUTE)
    deps.emit(cycleObservations(fresh, borderRouters, ts, deps.threadSignal))
  }

  const run = (): void => {
    const connection = deps.connection()
    if (!connection) return
    if (cycle) {
      again = true
      return
    }
    cycle = poll(connection).finally(() => {
      cycle = null
      if (again) {
        again = false
        run()
      }
    })
  }
  return { run }
}

/** Bridge state and node reachability, each reported when it changes */
export const createReporter = (
  protocols: readonly ProtocolMeta[],
  emit: Emit,
  now: () => number,
) => {
  let bridgeReported: boolean | null = null
  const online = new Map<string, boolean>()
  return {
    bridge: (up: boolean) => {
      if (bridgeReported === up) return
      bridgeReported = up
      emit(protocols.map((meta) => ({ kind: 'bridge', protocol: meta.id, ts: now(), online: up })))
    },
    reachability: (cache: NodeCache, ts: number) =>
      emit(
        availabilityOf(cache.all()).flatMap((report) => {
          const key = `${report.protocol}|${report.address}`
          if (online.get(key) === report.online) return []
          online.set(key, report.online)
          return [{ kind: 'availability' as const, report: { ...report, ts } }]
        }),
      ),
  }
}

/** Calls `retry` after a wait that doubles from 5 s to at most a minute; reset after success */
export const createBackoff = (retry: () => void) => {
  let wait = RECONNECT_MIN
  let timer: ReturnType<typeof setTimeout> | null = null
  return {
    schedule: () => {
      if (timer) return
      timer = setTimeout(() => {
        timer = null
        retry()
      }, wait)
      wait = Math.min(wait * 2, RECONNECT_MAX)
    },
    reset: () => {
      wait = RECONNECT_MIN
    },
    cancel: () => {
      if (timer) clearTimeout(timer)
      timer = null
    },
  }
}
