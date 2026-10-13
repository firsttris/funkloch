import { Database } from 'bun:sqlite'
import { join } from 'node:path'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import { migrate } from 'drizzle-orm/bun-sqlite/migrator'
import * as schema from './schema'

export type Db = ReturnType<typeof openDb>

/** The migrations are files in the image (src/db/migrations), applied on every start. */
export const MIGRATIONS_DIR =
  process.env.FUNKLOCH_MIGRATIONS ?? join(process.cwd(), 'src/db/migrations')

/** Opens (or creates) the database, switches it to WAL and applies pending migrations. */
export const openDb = (path: string) => {
  const sqlite = new Database(path, { create: true, strict: true })
  sqlite.run('PRAGMA journal_mode = WAL')
  sqlite.run('PRAGMA synchronous = NORMAL')
  sqlite.run('PRAGMA foreign_keys = ON')
  sqlite.run('PRAGMA busy_timeout = 5000')
  const db = drizzle({ client: sqlite, schema })
  migrate(db, { migrationsFolder: MIGRATIONS_DIR })
  return db
}
