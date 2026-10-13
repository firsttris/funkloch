import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { openDb } from './client'

/** A fresh database file in a temporary folder; `cleanup` removes it. */
export const tempDb = () => {
  const dir = mkdtempSync(join(tmpdir(), 'funkloch-'))
  return {
    db: openDb(join(dir, 'funkloch.db')),
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  }
}
