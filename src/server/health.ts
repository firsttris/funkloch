import { getRuntime } from './runtime'

/** For /healthz: the database answers and the adapters are connected */
export const health = () => {
  const runtime = getRuntime()
  let database = true
  try {
    runtime.db.$client.query('select 1').get()
  } catch {
    database = false
  }
  const adapters = runtime.adapters.map((adapter) => ({ id: adapter.meta.id, ...adapter.status() }))
  return { ok: database && adapters.every((a) => a.connected), database, adapters }
}
