// The settings page: everything a user can change after the first start.
import { statSync } from 'node:fs'
import { join } from 'node:path'
import { createServerFn } from '@tanstack/react-start'
import { getCookie } from '@tanstack/react-start/server'
import { z } from 'zod'
import { PROTOCOLS } from '~/adapters/registry'
import { passwordProblem, SESSION_COOKIE } from '~/core/auth'
import { activeDevices } from '~/db/queries'
import { setCustomName } from '~/db/store'
import { deleteOtherSessions, setAdminPassword, verifyAdminPassword } from '../auth'
import { getRuntime } from '../runtime'
import { adapterStates } from '../views/shared'

const fileSize = (path: string) => {
  try {
    return statSync(path).size
  } catch {
    return 0
  }
}

export const getSettingsPage = createServerFn({ method: 'GET' }).handler(() => {
  const runtime = getRuntime()
  const { settings } = runtime.viewContext()
  const file = join(
    runtime.config.DATA_DIR,
    runtime.config.FUNKLOCH_DEMO ? 'demo.db' : 'funkloch.db',
  )
  return {
    /** The server's time, so the page renders "connected 5 s ago" the same on both sides */
    now: Date.now(),
    settings,
    adapters: adapterStates(runtime.adapters),
    databaseBytes: fileSize(file) + fileSize(`${file}-wal`),
    dataDir: runtime.config.DATA_DIR,
    auth: !runtime.config.FUNKLOCH_DEMO,
    devices: activeDevices(runtime.db).map((d) => ({
      id: d.id,
      protocol: d.protocol,
      protocolLabel: PROTOCOLS[d.protocol]?.label ?? d.protocol,
      name: d.name,
      customName: d.customName,
      address: d.address,
      role: d.role,
    })),
  }
})

export const renameDevice = createServerFn({ method: 'POST' })
  .validator(z.object({ id: z.number().int().positive(), name: z.string().max(100) }))
  .handler(({ data }) => ({ ok: setCustomName(getRuntime().db, data.id, data.name) }))

export const changePassword = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      current: z.string().max(200),
      password: z.string().max(400),
      repeat: z.string().max(400),
    }),
  )
  .handler(async ({ data }) => {
    const { db } = getRuntime()
    if (!(await verifyAdminPassword(db, data.current)))
      return { ok: false as const, error: 'wrong' as const }
    const problem = passwordProblem(data.password, data.repeat)
    if (problem) return { ok: false as const, error: problem }
    await setAdminPassword(db, data.password)
    // Other browsers have to sign in again with the new password
    deleteOtherSessions(db, getCookie(SESSION_COOKIE))
    return { ok: true as const }
  })
