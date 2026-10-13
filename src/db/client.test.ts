import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { sql } from 'drizzle-orm'
import { afterEach, describe, expect, test } from 'vitest'
import { openDb } from './client'

const dirs: string[] = []
const tempFile = () => {
  const dir = mkdtempSync(join(tmpdir(), 'funkloch-'))
  dirs.push(dir)
  return join(dir, 'funkloch.db')
}

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

describe('openDb', () => {
  test('creates every table of the plan on an empty file', () => {
    const db = openDb(tempFile())
    const tables = db
      .all<{ name: string }>(sql`select name from sqlite_master where type = 'table' order by name`)
      .map((t) => t.name)
    expect(tables).toEqual(
      expect.arrayContaining([
        'channel_scans',
        'devices',
        'events',
        'hourly',
        'links',
        'samples',
        'settings',
        'snapshots',
      ]),
    )
  })

  test('opening again applies nothing twice and keeps the data', () => {
    const file = tempFile()
    openDb(file).run(sql`insert into settings (key, value) values ('a', '1')`)
    const again = openDb(file)
    expect(again.all(sql`select key from settings`)).toEqual([{ key: 'a' }])
  })

  test('runs in WAL mode with foreign keys', () => {
    const db = openDb(tempFile())
    expect(db.$client.query('pragma journal_mode').get()).toEqual({ journal_mode: 'wal' })
    expect(db.$client.query('pragma foreign_keys').get()).toEqual({ foreign_keys: 1 })
  })
})
