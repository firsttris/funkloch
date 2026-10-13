// The OTBR REST API, validated with Zod. Every call returns a result instead of throwing, so one
// failed request does not stop the poller.
import type { z } from 'zod'
import { type ActionItem, actionSchema, actionsSchema } from './schemas'

export type Result<T> = { ok: true; value: T } | { ok: false; error: string; status?: number }

const JSON_API = 'application/vnd.api+json'
const TIMEOUT = 30_000

export const createOtbrClient = (baseUrl: string, fetcher: typeof fetch = fetch) => {
  const request = async <T>(
    method: 'GET' | 'POST',
    path: string,
    schema: z.ZodType<T>,
    body?: unknown,
  ): Promise<Result<T>> => {
    try {
      const response = await fetcher(new URL(path, baseUrl), {
        method,
        headers: {
          // The OTBR compares the whole Accept header with one media type and answers 406 to a
          // list or a q parameter (measured on otbr-agent 0.3.0), so each path gets exactly one.
          accept: path.startsWith('/api/') ? JSON_API : 'application/json',
          ...(body ? { 'content-type': JSON_API } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(TIMEOUT),
      })
      if (!response.ok)
        return { ok: false, status: response.status, error: `HTTP ${response.status} for ${path}` }
      const parsed = schema.safeParse(await response.json())
      return parsed.success
        ? { ok: true, value: parsed.data }
        : { ok: false, error: `${path}: ${parsed.error.issues[0]?.message ?? 'invalid'}` }
    } catch (error) {
      return {
        ok: false,
        error: `${path}: ${error instanceof Error ? error.message : String(error)}`,
      }
    }
  }

  return {
    get: <T>(path: string, schema: z.ZodType<T>) => request('GET', path, schema),
    post: <T>(path: string, schema: z.ZodType<T>, body: unknown) =>
      request('POST', path, schema, body),
  }
}

export type OtbrClient = ReturnType<typeof createOtbrClient>

const DONE = new Set(['completed', 'stopped', 'failed'])

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Posts tasks to /api/actions and waits until each is done or its time is up; returns the
 * finished tasks (with the id of their result in /api/diagnostics where there is one).
 */
export const runTasks = async (
  client: OtbrClient,
  tasks: { type: string; attributes: Record<string, unknown> }[],
  timeoutSeconds: number,
  pollMs = 2000,
): Promise<Result<ActionItem[]>> => {
  const posted = await client.post('/api/actions', actionsSchema, { data: tasks })
  if (!posted.ok) return posted
  const finished: ActionItem[] = []
  const pending = new Map(posted.value.data.map((item) => [item.id, item]))
  const deadline = Date.now() + (timeoutSeconds + 10) * 1000
  while (pending.size > 0 && Date.now() < deadline) {
    await sleep(pollMs)
    for (const id of [...pending.keys()]) {
      const result = await client.get(`/api/actions/${id}`, actionSchema)
      if (!result.ok) continue
      if (DONE.has(result.value.data.attributes.status ?? '')) {
        finished.push(result.value.data)
        pending.delete(id)
      }
    }
  }
  return { ok: true, value: finished }
}
