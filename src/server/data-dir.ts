// Checks before the database opens that the data directory is ours to write. Without it a bind
// mount owned by another user ends in SQLite's bare "unable to open database file" (issue #9).
import '@tanstack/react-start/server-only'
import { accessSync, constants, existsSync, mkdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

export type DataDirFs = {
  mkdir: (dir: string) => void
  exists: (path: string) => boolean
  /** Throws when the process may not read and write the path */
  access: (path: string) => void
  owner: (path: string) => string | undefined
  uid: number | undefined
}

export const nodeDataDirFs: DataDirFs = {
  mkdir: (dir) => mkdirSync(dir, { recursive: true }),
  exists: existsSync,
  access: (path) => accessSync(path, constants.R_OK | constants.W_OK),
  owner: (path) => {
    try {
      const stat = statSync(path)
      return `${stat.uid}:${stat.gid}`
    } catch {
      return undefined
    }
  },
  uid: process.getuid?.(),
}

const DOCS = 'https://firsttris.github.io/funkloch/installation/#docker-compose'

const reasonOf = (error: unknown) =>
  error instanceof Error && 'code' in error ? String(error.code) : String(error)

const advice = (
  dir: string,
  uid: number | undefined,
  owner: string | undefined,
  reason: string,
) => {
  const user = uid === undefined ? 'Funkloch' : `Funkloch (uid ${uid})`
  const owned = owner === undefined ? '' : ` (owned by ${owner})`
  return (
    `${user} cannot write to ${dir}${owned}: ${reason}. ` +
    `Give the host directory to this user (chown -R ${uid ?? '<uid>'} <host dir>), with Podman mount it with :U ` +
    `(and :Z under SELinux). See ${DOCS}`
  )
}

/**
 * Creates the data directory if needed and checks that it and the database files already in it
 * can be read and written. Returns what is wrong, with the fix, or null.
 */
export const dataDirProblem = (dir: string, dbFile: string, fs: DataDirFs): string | null => {
  try {
    fs.mkdir(dir)
  } catch (error) {
    return advice(dir, fs.uid, undefined, reasonOf(error))
  }
  const paths = [dir, ...['', '-wal', '-shm'].map((suffix) => join(dir, dbFile + suffix))]
  for (const path of paths.filter((p) => p === dir || fs.exists(p))) {
    try {
      fs.access(path)
    } catch (error) {
      return advice(path, fs.uid, fs.owner(path), reasonOf(error))
    }
  }
  return null
}
