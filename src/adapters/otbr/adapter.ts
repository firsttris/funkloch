import type { Observation } from '~/core/types'
import type { Adapter, AdapterStatus } from '../types'
import { createOtbrClient } from './client'
import { threadMeta } from './meta'
import { createOtbrPoll } from './poll'

export type OtbrOptions = {
  url: string
  fetcher?: typeof fetch
  /** Milliseconds between two cycles; each part of a cycle keeps its own interval */
  cycleMs?: number
  taskPollMs?: number
  onProblem?: (message: string) => void
  onMode?: (mode: 'api' | 'legacy') => void
}

/** Failed cycles in a row before the border router counts as offline (one lost answer is not) */
export const OFFLINE_AFTER = 3

/** Polls the border router's REST API; a cycle never overlaps the one before. */
export const createOtbrAdapter = (options: OtbrOptions): Adapter => {
  let status: AdapterStatus = { connected: false, error: null, since: null }
  let requestTopology = () => {}

  const start = (emitObservation: (observation: Observation) => void) => {
    let stopped = false
    /** A cycle still running at stop says nothing more: the database may be closed by then */
    const emit = (observation: Observation) => {
      if (!stopped) emitObservation(observation)
    }
    const poll = createOtbrPoll({
      client: createOtbrClient(options.url, options.fetcher),
      emit,
      now: Date.now,
      taskPollMs: options.taskPollMs,
      onProblem: options.onProblem,
    })
    let running: Promise<void> | null = null
    /** A request during a cycle runs once that cycle is done */
    let again = false
    let mode: 'api' | 'legacy' | null = null
    let failures = 0
    /** What the bridge events last said; null before the first answer or verdict */
    let reported: boolean | null = null
    const report = (online: boolean) => {
      if (reported === online) return
      reported = online
      emit({ kind: 'bridge', protocol: threadMeta.id, ts: Date.now(), online })
    }

    const run = (): void => {
      if (stopped) return
      if (running) {
        again = true
        return
      }
      running = poll
        .cycle()
        .then((result) => {
          if (result.ok) {
            failures = 0
            report(true)
            if (!status.connected) status = { connected: true, error: null, since: Date.now() }
            if (mode !== result.value) options.onMode?.(result.value)
            mode = result.value
          } else {
            failures++
            if (failures >= OFFLINE_AFTER) report(false)
            if (status.connected || status.error === null) options.onProblem?.(result.error)
            status = {
              connected: false,
              error: result.error,
              since: status.connected ? Date.now() : status.since,
            }
          }
        })
        .finally(() => {
          running = null
          if (again) {
            again = false
            run()
          }
        })
    }

    requestTopology = () => {
      poll.requestTopology()
      run()
    }
    run()
    const timer = setInterval(() => {
      if (!running) run()
    }, options.cycleMs ?? 60_000)

    // A cycle can wait minutes for an energy scan; stopping does not wait for it
    return async () => {
      stopped = true
      clearInterval(timer)
      requestTopology = () => {}
    }
  }

  return {
    id: threadMeta.id,
    label: threadMeta.label,
    protocols: [threadMeta],
    start,
    status: () => status,
    requestTopology: () => requestTopology(),
  }
}
