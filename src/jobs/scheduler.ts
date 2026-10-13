import { hourStart } from '~/core/rollup'
import { MINUTE } from '~/core/types'
import type { Db } from '~/db/client'
import { checkReachability } from '~/db/reachability'
import { applyRetention } from '~/db/retention'
import { rollupPending } from '~/db/rollup'
import type { Log } from '~/server/log'

/** Local hour (TZ) at which the nightly retention runs */
export const RETENTION_HOUR = 3

/**
 * One tick a minute: reachability every time, the rollup after every full hour (and once at
 * start to catch up), retention once a night.
 */
export const startScheduler = (db: Db, log: Log, clock: () => number = Date.now) => {
  let rolledHour: number | null = null
  let retentionDay: string | null = null

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
    if (hourStart(now) !== rolledHour) {
      rolledHour = hourStart(now)
      run('rollup', () => rollupPending(db, now))
    }
    run('reachability', () => checkReachability(db, now))
    const local = new Date(now)
    const day = local.toDateString()
    if (local.getHours() === RETENTION_HOUR && day !== retentionDay) {
      retentionDay = day
      run('retention', () => applyRetention(db, now))
    }
  }

  tick()
  const timer = setInterval(tick, MINUTE)
  return () => clearInterval(timer)
}
