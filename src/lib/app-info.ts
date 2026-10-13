import { queryOptions } from '@tanstack/react-query'
import { getAppInfo } from '~/server/fn/app'

export const appInfoQuery = queryOptions({
  queryKey: ['app-info'],
  queryFn: () => getAppInfo(),
  staleTime: Number.POSITIVE_INFINITY,
})
