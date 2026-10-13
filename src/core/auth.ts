// The decisions behind the login, as pure functions: cookies, same-origin checks, redirects,
// password rules and the throttle for failed logins.

export const SESSION_COOKIE = 'funkloch_session'
export const SESSION_DAYS = 30
export const MIN_PASSWORD = 10

export const parseCookies = (header: string | null): Map<string, string> =>
  new Map(
    (header ?? '').split(';').flatMap((raw) => {
      const part = raw.trim()
      const index = part.indexOf('=')
      if (index < 1) return []
      try {
        return [[part.slice(0, index).trim(), decodeURIComponent(part.slice(index + 1).trim())]]
      } catch {
        return []
      }
    }),
  )

/**
 * CSRF protection for requests that change something: a browser sends Sec-Fetch-Site and Origin
 * with a cross-site request; either one pointing elsewhere is refused (OWASP's "verifying origin
 * with standard headers"). Requests without both (curl, scripts) need the session cookie anyway.
 */
export const isSameOrigin = (request: { url: string; headers: Headers }) => {
  const site = request.headers.get('sec-fetch-site')
  if (site && site !== 'same-origin' && site !== 'none') return false
  const origin = request.headers.get('origin')
  if (!origin || origin === 'null') return origin !== 'null'
  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host')
  try {
    return new URL(origin).host === (host ?? new URL(request.url).host)
  } catch {
    return false
  }
}

/** Only paths on this site, never "//evil.example" or absolute URLs */
export const safeRedirect = (target: string | null | undefined, fallback = '/') =>
  target?.startsWith('/') && !target.startsWith('//') && !target.startsWith('/\\')
    ? target
    : fallback

export type PasswordProblem = 'too_short' | 'too_long' | 'mismatch'

export const passwordProblem = (password: string, repeat: string): PasswordProblem | null => {
  if (password.length < MIN_PASSWORD) return 'too_short'
  if (password.length > 200) return 'too_long'
  return password === repeat ? null : 'mismatch'
}

/** Failed logins per client: after 5 within 15 minutes, wait until the window has passed */
export const THROTTLE_ATTEMPTS = 5
export const THROTTLE_WINDOW = 15 * 60_000

export const throttled = (failures: readonly number[], now: number) =>
  failures.filter((ts) => now - ts < THROTTLE_WINDOW).length >= THROTTLE_ATTEMPTS

export const recordFailure = (failures: readonly number[], now: number) => [
  ...failures.filter((ts) => now - ts < THROTTLE_WINDOW),
  now,
]

/** Secure cookies behind https, including a proxy that terminates TLS */
export const isHttps = (request: { url: string; headers: Headers }) =>
  request.headers.get('x-forwarded-proto') === 'https' || new URL(request.url).protocol === 'https:'

export const sessionCookie = (token: string, secure: boolean, maxAgeDays = SESSION_DAYS) =>
  [
    `${SESSION_COOKIE}=${token}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${Math.round(maxAgeDays * 86_400)}`,
    ...(secure ? ['Secure'] : []),
  ].join('; ')

export const clearedSessionCookie = (secure: boolean) => sessionCookie('', secure, 0)
