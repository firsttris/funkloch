import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query'
import { createRouter, isRedirect } from '@tanstack/react-router'
import { setupRouterSsrQueryIntegration } from '@tanstack/react-router-ssr-query'
import { ErrorPage, PageNotFound } from './components/not-found'
import { routeTree } from './routeTree.gen'

/**
 * A server function called after the session ended answers with a redirect to the login
 * (src/server/auth.ts). Loaders follow it on their own; a refetch or a form outside one lands here.
 */
const followRedirect = (error: unknown) => {
  if (typeof window !== 'undefined' && isRedirect(error) && error.options.href)
    window.location.assign(error.options.href)
}

export function getRouter() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { staleTime: 30_000, refetchOnWindowFocus: true } },
    queryCache: new QueryCache({ onError: followRedirect }),
    mutationCache: new MutationCache({ onError: followRedirect }),
  })
  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreload: 'intent',
    defaultNotFoundComponent: PageNotFound,
    defaultErrorComponent: ErrorPage,
  })
  // Hands the data the server loaded to the client, so hydration renders the same values
  setupRouterSsrQueryIntegration({ router, queryClient })
  return router
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof getRouter>
  }
}
