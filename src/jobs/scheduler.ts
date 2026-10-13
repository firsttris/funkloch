import { signalFormat } from '~/adapters/registry'
import { hourStart } from '~/core/rollup'
import type { Settings } from '~/core/settings'
import { MINUTE } from '~/core/types'
import type { Db } from '~/db/client'
import { detectPatterns, detectSignal, detectTrends } from '~/db/detect'
import { checkReachability } from '~/db/reachability'
import { applyRetention } from '~/db/retention'
import { rollupPending } from '~/db/rollup'
import type { Log } from '~/server/log'

/** Local hour (TZ) at which the nightly jobs run */
export const NIGHTLY_HOUR = 3

export type Jobs = {
  /** Extra work after each hourly rollup, e.g. pattern detection */
  hourly?: (now: number) => void
  /** Extra work once a night */
  nightly?: (now: number) => void
  /** Extra work every minute, e.g. notifications */
  minutely?: (now: number) => void
}

/**
 * One tick a minute: reachability and the signal check every time, rollup and trend after every
 * full hour (and once at start to catch up), retention once a night.
 */
export const startScheduler = (
  db: Db,
  log: Log,
  settings: () => Settings,
  jobs: Jobs = {},
  clock: () => number = Date.now,
) => {
  let rolledHour: number | null = null
  let nightlyDay: string | null = null

  const run = (what: string, job: () => unknown) => {
    try {
      const result = job()
      log.debug({ result }, what)
    } catch (error) {
      log.error({ err: error }, `${what} failed`)
    }
  }

  const tick = () => {
    const now = clock()
    const current = settings()
    if (hourStart(now) !== rolledHour) {
      rolledHour = hourStart(now)
      run('rollup', () => rollupPending(db, now))
      run('trend', () => detectTrends(db, now))
      if (jobs.hourly) run('hourly jobs', () => jobs.hourly?.(now))
    }
    run('reachability', () => checkReachability(db, now))
    run('signal', () =>
      detectSignal(db, now, current.thresholds, current.rules.signal.minutes, signalFormat),
    )
    const local = new Date(now)
    const day = local.toDateString()
    if (local.getHours() === NIGHTLY_HOUR && day !== nightlyDay) {
      nightlyDay = day
      run('retention', () => applyRetention(db, now, current.retention))
      run('patterns', () => detectPatterns(db, now, current.thresholds))
      if (jobs.nightly) run('nightly jobs', () => jobs.nightly?.(now))
    }
    if (jobs.minutely) run('minutely jobs', () => jobs.minutely?.(now))
  }

  tick()
  const timer = setInterval(tick, MINUTE)
  return () => clearInterval(timer)
}
