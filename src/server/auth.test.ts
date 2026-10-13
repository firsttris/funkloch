import { afterEach, describe, expect, test } from 'vitest'
import { tempDb } from '~/db/test-db'
import { type AuthOptions, handleAuth, hasAdmin, resetAdmin } from './auth'

let cleanup = () => {}
afterEach(() => cleanup())

const BASE = 'http://funkloch.local:8090'

const setup = () => {
  const t = tempDb()
  cleanup = t.cleanup
  const options: AuthOptions = { db: t.db, enabled: true, dev: false }
  return { db: t.db, options }
}

const page = (path: string, cookie?: string) =>
  new Request(`${BASE}${path}`, {
    headers: { accept: 'text/html', 'sec-fetch-dest': 'document', ...(cookie ? { cookie } : {}) },
  })

const post = (path: string, form: Record<string, string>, headers: Record<string, string> = {}) =>
  new Request(`${BASE}${path}`, {
    method: 'POST',
    body: new URLSearchParams(form),
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      origin: BASE,
      host: 'funkloch.local:8090',
      ...headers,
    },
  })

const cookieOf = (response: Response | null) =>
  response?.headers.get('set-cookie')?.split(';')[0] ?? ''

const signUp = async (options: AuthOptions, password = 'correct horse battery') =>
  cookieOf(await handleAuth(post('/auth/setup', { password, repeat: password }), options))

describe('first start', () => {
  test('every page leads to /setup, the API answers 401', async () => {
    const { options } = setup()
    expect((await handleAuth(page('/'), options))?.headers.get('location')).toBe('/setup')
    expect(await handleAuth(page('/setup'), options)).toBeNull()
    expect((await handleAuth(new Request(`${BASE}/api/live`), options))?.status).toBe(401)
    expect(await handleAuth(page('/healthz'), options)).toBeNull()
  })

  test('setup refuses a short or mismatched password, then signs in', async () => {
    const { db, options } = setup()
    const short = await handleAuth(
      post('/auth/setup', { password: 'short', repeat: 'short' }),
      options,
    )
    expect(short?.headers.get('location')).toBe('/setup?error=too_short')
    const mismatch = await handleAuth(
      post('/auth/setup', { password: 'long enough 1', repeat: 'long enough 2' }),
      options,
    )
    expect(mismatch?.headers.get('location')).toBe('/setup?error=mismatch')
    expect(hasAdmin(db)).toBe(false)

    const cookie = await signUp(options)
    expect(cookie).toMatch(/^funkloch_session=.{20,}/)
    expect(hasAdmin(db)).toBe(true)
    expect(await handleAuth(page('/', cookie), options)).toBeNull()
  })

  test('a second setup is refused', async () => {
    const { options } = setup()
    await signUp(options)
    const again = await handleAuth(
      post('/auth/setup', { password: 'another password', repeat: 'another password' }),
      options,
    )
    expect(again?.headers.get('location')).toBe('/login')
    expect((await handleAuth(page('/setup'), options))?.headers.get('location')).toBe('/login')
  })

  test('a reset forgets the password and ends every session', async () => {
    const { db, options } = setup()
    const cookie = await signUp(options)
    resetAdmin(db)
    expect(hasAdmin(db)).toBe(false)
    expect((await handleAuth(page('/', cookie), options))?.headers.get('location')).toBe('/setup')
    expect(await signUp(options, 'a new password')).toMatch(/^funkloch_session=/)
  })
})

describe('login', () => {
  test('without a session pages lead to /login with the way back', async () => {
    const { options } = setup()
    await signUp(options)
    const answer = await handleAuth(page('/devices/3?range=7d'), options)
    expect(answer?.status).toBe(303)
    expect(answer?.headers.get('location')).toBe('/login?next=%2Fdevices%2F3%3Frange%3D7d')
    expect(await handleAuth(page('/login'), options)).toBeNull()
  })

  test('the right password signs in and goes back, a wrong one does not', async () => {
    const { options } = setup()
    await signUp(options)
    const wrong = await handleAuth(
      post('/auth/login', { password: 'nope nope nope', next: '/events' }),
      options,
    )
    expect(wrong?.headers.get('location')).toBe('/login?error=wrong&next=%2Fevents')
    expect(wrong?.headers.get('set-cookie')).toBeNull()

    const right = await handleAuth(
      post('/auth/login', { password: 'correct horse battery', next: '/events' }),
      options,
    )
    expect(right?.headers.get('location')).toBe('/events')
    const cookie = cookieOf(right)
    expect(await handleAuth(page('/events', cookie), options)).toBeNull()
    expect((await handleAuth(page('/login', cookie), options))?.headers.get('location')).toBe('/')
  })

  test('a login never redirects to another site', async () => {
    const { options } = setup()
    await signUp(options)
    const answer = await handleAuth(
      post('/auth/login', { password: 'correct horse battery', next: '//evil.example' }),
      options,
    )
    expect(answer?.headers.get('location')).toBe('/')
  })

  test('five wrong passwords lock the login for 15 minutes', async () => {
    const { options } = setup()
    await signUp(options)
    let now = 1_000_000
    const timed = { ...options, now: () => now }
    const attempt = (password: string) =>
      handleAuth(post('/auth/login', { password }, { 'x-forwarded-for': '10.0.0.9' }), timed)
    for (let i = 0; i < 5; i++) await attempt('wrong password!')
    expect((await attempt('correct horse battery'))?.headers.get('location')).toBe(
      '/login?error=throttled',
    )
    now += 16 * 60_000
    expect((await attempt('correct horse battery'))?.headers.get('location')).toBe('/')
  })

  test('a server function without a session gets a redirect its client follows', async () => {
    const { options } = setup()
    await signUp(options)
    const call = new Request(`${BASE}/_serverFn/abc`, {
      headers: { 'x-tsr-serverFn': 'true', referer: `${BASE}/events?days=7` },
    })
    const answer = await handleAuth(call, options)
    expect(answer?.status).toBe(401)
    expect(await answer?.json()).toEqual({
      error: 'not signed in',
      isSerializedRedirect: true,
      href: '/login?next=%2Fevents%3Fdays%3D7',
      reloadDocument: true,
    })
    const plain = await handleAuth(new Request(`${BASE}/api/events.csv`), options)
    expect(await plain?.json()).toEqual({ error: 'not signed in' })
  })

  test('a made-up X-Forwarded-For in front of the proxy does not reset the count', async () => {
    const { options } = setup()
    await signUp(options)
    const timed = { ...options, now: () => 2_000_000 }
    const attempt = (password: string, i: number) =>
      handleAuth(
        post('/auth/login', { password }, { 'x-forwarded-for': `203.0.113.${i}, 10.0.0.7` }),
        timed,
      )
    for (let i = 0; i < 5; i++) await attempt('wrong password!', i)
    expect((await attempt('correct horse battery', 9))?.headers.get('location')).toBe(
      '/login?error=throttled',
    )
  })

  test('logout ends the session', async () => {
    const { options } = setup()
    const cookie = await signUp(options)
    const out = await handleAuth(post('/auth/logout', {}, { cookie }), options)
    expect(out?.headers.get('location')).toBe('/login')
    expect(out?.headers.get('set-cookie')).toContain('Max-Age=0')
    expect((await handleAuth(page('/', cookie), options))?.headers.get('location')).toMatch(
      /^\/login/,
    )
  })

  test('a forged or expired session does not count', async () => {
    const { options } = setup()
    await signUp(options)
    expect((await handleAuth(page('/', 'funkloch_session=forged'), options))?.status).toBe(303)
    const cookie = await signUp({ ...options })
    const later = { ...options, now: () => Date.now() + 31 * 24 * 3_600_000 }
    expect(cookie).toBe('')
    const login = await handleAuth(
      post('/auth/login', { password: 'correct horse battery' }),
      options,
    )
    expect((await handleAuth(page('/', cookieOf(login)), later))?.status).toBe(303)
  })
})

describe('CSRF', () => {
  test('a cross-site write is refused, even without login enabled', async () => {
    const { options } = setup()
    const forged = post(
      '/auth/login',
      { password: 'x' },
      { origin: 'https://evil.example', 'sec-fetch-site': 'cross-site' },
    )
    expect((await handleAuth(forged, options))?.status).toBe(403)
    const demo = { ...options, enabled: false }
    const serverFn = new Request(`${BASE}/_serverFn/abc`, {
      method: 'POST',
      headers: { origin: 'https://evil.example' },
    })
    expect((await handleAuth(serverFn, demo))?.status).toBe(403)
  })

  test('the demo needs no login', async () => {
    const { options } = setup()
    expect(await handleAuth(page('/'), { ...options, enabled: false })).toBeNull()
  })
})
