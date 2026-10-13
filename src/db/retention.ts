import { lt } from 'drizzle-orm'
import { DAY } from '~/core/types'
import type { Db } from './client'
import { events, hourly, samples, snapshots } from './schema'

export type Retention = { samplesDays: number; hourlyDays: number }

export const DEFAULT_RETENTION: Retention = { samplesDays: 14, hourlyDays: 365 }

/** Deletes what is past its retention and vacuums when more than 10 % of the file is free. */
export const applyRetention = (db: Db, now: number, retention = DEFAULT_RETENTION) => {
  db.delete(samples)
    .where(lt(samples.ts, now - retention.samplesDays * DAY))
    .run()
  db.delete(hourly)
    .where(lt(hourly.hour, now - retention.hourlyDays * DAY))
    .run()
  db.delete(snapshots)
    .where(lt(snapshots.ts, now - retention.hourlyDays * DAY))
    .run()
  db.delete(events)
    .where(lt(events.ts, now - retention.hourlyDays * DAY))
    .run()
  const sqlite = db.$client
  const { freelist_count: free } = sqlite.query('pragma freelist_count').get() as {
    freelist_count: number
  }
  const { page_count: pages } = sqlite.query('pragma page_count').get() as { page_count: number }
  const vacuumed = pages > 0 && free / pages > 0.1
  if (vacuumed) sqlite.run('VACUUM')
  return { vacuumed }
}
