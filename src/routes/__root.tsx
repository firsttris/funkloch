import { type QueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { createRootRouteWithContext, HeadContent, Outlet, Scripts } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import { appInfoQuery } from '~/lib/app-info'
import { setTimeZone } from '~/lib/time-zone'
import { useLiveUpdates } from '~/lib/use-live-updates'
import { getLocale } from '~/paraglide/runtime.js'
import appCss from '~/styles.css?url'

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'Funkloch' },
    ],
    links: [
      { rel: 'stylesheet', href: appCss },
      { rel: 'icon', href: '/favicon.svg', type: 'image/svg+xml' },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(appInfoQuery),
  component: RootComponent,
})

function RootComponent() {
  useLiveUpdates()
  // Before any page renders a date, so server and browser write the same one
  setTimeZone(useSuspenseQuery(appInfoQuery).data.timeZone)
  return (
    <RootDocument>
      <Outlet />
    </RootDocument>
  )
}

function RootDocument({ children }: { children: ReactNode }) {
  return (
    <html lang={getLocale()}>
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  )
}
