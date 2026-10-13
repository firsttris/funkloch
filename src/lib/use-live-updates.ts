import { useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { type Change, staleKeys } from '~/core/live'

/** At most one refetch per key in this time, however busy the network is */
const THROTTLE_MS = 3000

/** Listens to /api/live and refetches what changed; the browser reconnects on its own. */
export const useLiveUpdates = () => {
  const queryClient = useQueryClient()
  useEffect(() => {
    if (typeof EventSource === 'undefined') return
    const source = new EventSource('/api/live')
    const pending = new Set<string>()
    let timer: ReturnType<typeof setTimeout> | undefined
    const flush = () => {
      timer = undefined
      for (const key of pending) queryClient.invalidateQueries({ queryKey: [key] })
      pending.clear()
    }
    source.addEventListener('change', (message) => {
      try {
        for (const key of staleKeys(JSON.parse(message.data) as Change)) pending.add(key)
      } catch {
        return
      }
      timer ??= setTimeout(flush, THROTTLE_MS)
    })
    return () => {
      clearTimeout(timer)
      source.close()
    }
  }, [queryClient])
}
