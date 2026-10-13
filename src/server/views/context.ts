import type { Adapter } from '~/adapters/types'
import type { Settings } from '~/core/settings'
import type { Db } from '~/db/client'

/** What every view reads from: passed in, so tests can hand in a seeded database */
export type ViewContext = { db: Db; now: number; settings: Settings; adapters: readonly Adapter[] }
