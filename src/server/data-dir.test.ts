import { describe, expect, test } from 'vitest'
import { type DataDirFs, dataDirProblem } from './data-dir'

const denied = Object.assign(new Error('permission denied'), { code: 'EACCES' })

const fakeFs = (opts: { files?: string[]; readOnly?: string[]; mkdirFails?: boolean }) => {
  const made: string[] = []
  const fs: DataDirFs = {
    mkdir: (dir) => {
      if (opts.mkdirFails) throw denied
      made.push(dir)
    },
    exists: (path) => (opts.files ?? []).includes(path),
    access: (path) => {
      if ((opts.readOnly ?? []).includes(path)) throw denied
    },
    owner: () => '0:0',
    uid: 1000,
  }
  return { fs, made }
}

describe('dataDirProblem', () => {
  test('a writable directory is fine and gets created', () => {
    const { fs, made } = fakeFs({})
    expect(dataDirProblem('/data', 'funkloch.db', fs)).toBeNull()
    expect(made).toEqual(['/data'])
  })

  test('a directory owned by someone else is named with its owner and the fix', () => {
    const { fs } = fakeFs({ readOnly: ['/data'] })
    const problem = dataDirProblem('/data', 'funkloch.db', fs)
    expect(problem).toContain('Funkloch (uid 1000) cannot write to /data (owned by 0:0): EACCES')
    expect(problem).toContain('chown -R 1000 <host dir>')
  })

  test('a database file left by another user is found too', () => {
    const { fs } = fakeFs({
      files: ['/data/funkloch.db', '/data/funkloch.db-wal'],
      readOnly: ['/data/funkloch.db-wal'],
    })
    expect(dataDirProblem('/data', 'funkloch.db', fs)).toContain(
      'cannot write to /data/funkloch.db-wal',
    )
  })

  test('a directory that cannot be created is reported without an owner', () => {
    const { fs } = fakeFs({ mkdirFails: true })
    expect(dataDirProblem('/data', 'funkloch.db', fs)).toContain('cannot write to /data: EACCES')
  })
})
