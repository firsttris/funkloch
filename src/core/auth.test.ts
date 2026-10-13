import { describe, expect, test } from 'vitest'
import {
  clearedSessionCookie,
  forwardedClient,
  isHttps,
  isSameOrigin,
  parseCookies,
  passwordProblem,
  pruneFailures,
  recordFailure,
  safeRedirect,
  sessionCookie,
  THROTTLE_WINDOW,
  throttled,
} from './auth'

const request = (headers: Record<string, string>, url = 'http://funkloch.local:8090/x') => ({
  url,
  headers: new Headers(headers),
})

describe('parseCookies', () => {
  test('reads name=value pairs and ignores junk', () => {
    expect(parseCookies('a=1; funkloch_session=abc%3D; broken; =x')).toEqual(
      new Map([
        ['a', '1'],
        ['funkloch_session', 'abc='],
      ]),
    )
    expect(parseCookies(null).size).toBe(0)
  })
})

describe('isSameOrigin', () => {
  test('a same-origin browser request passes', () => {
    expect(
      isSameOrigin(
        request({
          origin: 'http://funkloch.local:8090',
          host: 'funkloch.local:8090',
          'sec-fetch-site': 'same-origin',
        }),
      ),
    ).toBe(true)
  })

  test('a cross-site request is refused, by either header', () => {
    expect(isSameOrigin(request({ 'sec-fetch-site': 'cross-site' }))).toBe(false)
    expect(
      isSameOrigin(request({ origin: 'https://evil.example', host: 'funkloch.local:8090' })),
    ).toBe(false)
    expect(isSameOrigin(request({ origin: 'null' }))).toBe(false)
  })

  test('behind a proxy the forwarded host counts; requests without both headers pass', () => {
    expect(
      isSameOrigin(
        request({
          origin: 'https://funk.example',
          host: 'localhost:8090',
          'x-forwarded-host': 'funk.example',
        }),
      ),
    ).toBe(true)
    expect(isSameOrigin(request({}))).toBe(true)
  })
})

describe('safeRedirect', () => {
  test('keeps local paths, refuses others', () => {
    expect(safeRedirect('/devices/3?range=7d')).toBe('/devices/3?range=7d')
    expect(safeRedirect('//evil.example')).toBe('/')
    expect(safeRedirect('https://evil.example')).toBe('/')
    expect(safeRedirect('/\\evil.example')).toBe('/')
    expect(safeRedirect(null, '/events')).toBe('/events')
  })
})

describe('passwordProblem', () => {
  test('at least 10 characters, both entries equal', () => {
    expect(passwordProblem('short', 'short')).toBe('too_short')
    expect(passwordProblem('long enough!', 'long enough?')).toBe('mismatch')
    expect(passwordProblem('long enough!', 'long enough!')).toBeNull()
    expect(passwordProblem('x'.repeat(201), 'x'.repeat(201))).toBe('too_long')
  })
})

describe('throttle', () => {
  test('five failures within 15 minutes lock, older ones fall out', () => {
    let failures: number[] = []
    for (let i = 0; i < 4; i++) failures = recordFailure(failures, i * 1000)
    expect(throttled(failures, 5000)).toBe(false)
    failures = recordFailure(failures, 5000)
    expect(throttled(failures, 6000)).toBe(true)
    expect(throttled(failures, 16 * 60_000)).toBe(false)
  })
})

describe('cookies', () => {
  test('session cookie is HttpOnly and Lax, Secure behind https', () => {
    expect(sessionCookie('t', false)).toBe(
      'funkloch_session=t; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000',
    )
    expect(sessionCookie('t', true)).toContain('; Secure')
    expect(clearedSessionCookie(false)).toContain('Max-Age=0')
  })

  test('https is seen directly or through a proxy', () => {
    expect(isHttps(request({}, 'https://a/'))).toBe(true)
    expect(isHttps(request({ 'x-forwarded-proto': 'https' }))).toBe(true)
    expect(isHttps(request({}))).toBe(false)
  })
})

describe('forwardedClient', () => {
  test('is the entry the proxy appended, not one the client sent', () => {
    expect(forwardedClient('1.2.3.4, 10.0.0.9')).toBe('10.0.0.9')
    expect(forwardedClient('10.0.0.9')).toBe('10.0.0.9')
    expect(forwardedClient(null)).toBe('local')
    expect(forwardedClient('')).toBe('local')
  })
})

describe('pruneFailures', () => {
  test('keeps the failures inside the window and drops clients without any', () => {
    const failures = new Map([
      ['old', [0]],
      ['recent', [0, THROTTLE_WINDOW]],
    ])
    expect(pruneFailures(failures, THROTTLE_WINDOW + 1)).toEqual(
      new Map([['recent', [THROTTLE_WINDOW]]]),
    )
  })
})
