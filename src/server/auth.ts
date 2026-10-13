import '@tanstack/react-start/server-only'
import { createHash, randomBytes } from 'node:crypto'
import { eq, lt, ne } from 'drizzle-orm'
import {
  clearedSessionCookie,
  isHttps,
  isSameOrigin,
  parseCookies,
  passwordProblem,
  recordFailure,
  SESSION_COOKIE,
  SESSION_DAYS,
  safeRedirect,
  sessionCookie,
  throttled,
} from '~/core/auth'
import { DAY } from '~/core/types'
import type { Db } from '~/db/client'
import { sessions, settings } from '~/db/schema'
import { getSetting, setSetting } from '~/db/store'

const ADMIN_KEY = 'admin'

type Admin = { hash: string }

export const hasAdmin = (db: Db) => getSetting<Admin>(db, ADMIN_KEY) !== undefined

export const setAdminPassword = async (db: Db, password: string) =>
  setSetting(db, ADMIN_KEY, { hash: await Bun.password.hash(password, { algorithm: 'argon2id' }) })

export const verifyAdminPassword = async (db: Db, password: string) => {
  const admin = getSetting<Admin>(db, ADMIN_KEY)
  return admin ? Bun.password.verify(password, admin.hash) : false
}

/** Forgets the password and every session, so the next visit sets a new password (/setup) */
export const resetAdmin = (db: Db) => {
  db.delete(settings).where(eq(settings.key, ADMIN_KEY)).run()
  db.delete(sessions).run()
}

const hashToken = (token: string) => createHash('sha256').update(token).digest('hex')

export const createSession = (db: Db, now: number) => {
  const token = randomBytes(32).toString('base64url')
  db.delete(sessions).where(lt(sessions.expiresAt, now)).run()
  db.insert(sessions)
    .values({ tokenHash: hashToken(token), createdAt: now, expiresAt: now + SESSION_DAYS * DAY })
    .run()
  return token
}

export const validSession = (db: Db, token: string | undefined, now: number) => {
  if (!token) return false
  const row = db
    .select()
    .from(sessions)
    .where(eq(sessions.tokenHash, hashToken(token)))
    .get()
  return row !== undefined && row.expiresAt > now
}

export const deleteSession = (db: Db, token: string | undefined) => {
  if (token)
    db.delete(sessions)
      .where(eq(sessions.tokenHash, hashToken(token)))
      .run()
}

/** Ends every other session, e.g. after a password change */
export const deleteOtherSessions = (db: Db, token: string | undefined) =>
  db
    .delete(sessions)
    .where(token ? ne(sessions.tokenHash, hashToken(token)) : undefined)
    .run()

const PUBLIC = [/^\/login$/, /^\/setup$/, /^\/healthz$/, /^\/favicon\.svg$/, /^\/assets\//]
const DEV_ONLY = [/^\/@/, /^\/src\//, /^\/node_modules\//, /^\/__/]

const redirect = (location: string, cookie?: string) =>
  new Response(null, {
    status: 303,
    headers: { location, ...(cookie ? { 'set-cookie': cookie } : {}) },
  })

const wantsPage = (request: Request) =>
  request.method === 'GET' &&
  (request.headers.get('sec-fetch-dest') === 'document' ||
    (request.headers.get('accept') ?? '').includes('text/html'))

/** Failed logins per client address, in memory; a restart forgets them */
const failures = new Map<string, number[]>()

const clientKey = (request: Request) =>
  request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'local'

export type AuthOptions = { db: Db; enabled: boolean; dev: boolean; now?: () => number }

/**
 * Runs before the app for every request. Answers the login, setup and logout forms, refuses
 * cross-site writes, sends visitors without a session to /login (or /setup before the first
 * password) and returns null when the request may go on to the app.
 */
export const handleAuth = async (
  request: Request,
  options: AuthOptions,
): Promise<Response | null> => {
  const { db, enabled } = options
  const now = options.now?.() ?? Date.now()
  const url = new URL(request.url)
  const path = url.pathname
  const writes = request.method !== 'GET' && request.method !== 'HEAD'

  if (writes && !isSameOrigin(request))
    return new Response('Cross-site request refused', { status: 403 })
  if (!enabled) return null
  if (options.dev && DEV_ONLY.some((p) => p.test(path))) return null

  const secure = isHttps(request)
  const token = parseCookies(request.headers.get('cookie')).get(SESSION_COOKIE)
  const admin = hasAdmin(db)

  if (path === '/auth/setup' && request.method === 'POST') {
    if (admin) return redirect('/login')
    const form = await request.formData()
    const password = String(form.get('password') ?? '')
    const problem = passwordProblem(password, String(form.get('repeat') ?? ''))
    if (problem) return redirect(`/setup?error=${problem}`)
    await setAdminPassword(db, password)
    return redirect('/', sessionCookie(createSession(db, now), secure))
  }

  if (path === '/auth/login' && request.method === 'POST') {
    const form = await request.formData()
    const next = safeRedirect(String(form.get('next') ?? '/'))
    const key = clientKey(request)
    if (throttled(failures.get(key) ?? [], now)) return redirect('/login?error=throttled')
    if (!(await verifyAdminPassword(db, String(form.get('password') ?? '')))) {
      failures.set(key, recordFailure(failures.get(key) ?? [], now))
      return redirect(`/login?error=wrong&next=${encodeURIComponent(next)}`)
    }
    failures.delete(key)
    return redirect(next, sessionCookie(createSession(db, now), secure))
  }

  if (path === '/auth/logout' && request.method === 'POST') {
    deleteSession(db, token)
    return redirect('/login', clearedSessionCookie(secure))
  }

  if (!admin) {
    if (path === '/setup' || PUBLIC.some((p) => p.test(path) && path !== '/login')) return null
    return wantsPage(request)
      ? redirect('/setup')
      : Response.json({ error: 'setup required' }, { status: 401 })
  }
  if (path === '/setup') return redirect('/login')

  const signedIn = validSession(db, token, now)
  if (signedIn) return path === '/login' ? redirect('/') : null
  if (PUBLIC.some((p) => p.test(path))) return null
  return wantsPage(request)
    ? redirect(`/login?next=${encodeURIComponent(path + url.search)}`)
    : Response.json({ error: 'not signed in' }, { status: 401 })
}
