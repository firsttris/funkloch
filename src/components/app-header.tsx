import { useSuspenseQuery } from '@tanstack/react-query'
import { Link, useRouterState } from '@tanstack/react-router'
import { appInfoQuery } from '~/lib/app-info'
import { cn } from '~/lib/cn'
import { m } from '~/paraglide/messages.js'
import { getLocale, setLocale } from '~/paraglide/runtime.js'

export type AdapterPill = { id: string; label: string; connected: boolean; error: string | null }

const Logo = () => (
  <svg width="28" height="28" viewBox="0 0 28 28" aria-hidden="true">
    <rect width="28" height="28" rx="7" className="fill-primary" />
    <circle cx="9" cy="19" r="2.2" className="fill-primary-foreground" />
    <path
      d="M9 13.5a5.5 5.5 0 0 1 5.5 5.5"
      strokeWidth="2"
      fill="none"
      strokeLinecap="round"
      className="stroke-primary-foreground"
    />
    <path
      d="M9 8.5A10.5 10.5 0 0 1 19.5 19"
      strokeWidth="2"
      fill="none"
      strokeLinecap="round"
      className="stroke-primary-foreground"
    />
  </svg>
)

const navLink =
  'inline-flex min-h-10 items-center rounded-md px-3 text-foreground-subtle no-underline hover:bg-track hover:text-foreground'

export const AppHeader = ({ adapters }: { adapters: AdapterPill[] }) => {
  const other = getLocale() === 'de' ? 'en' : 'de'
  const { data: info } = useSuspenseQuery(appInfoQuery)
  const pathname = useRouterState({ select: (state) => state.location.pathname })
  const nav = [
    {
      to: '/',
      label: m.nav_devices(),
      active: pathname === '/' || pathname.startsWith('/devices'),
    },
    { to: '/network', label: m.nav_network(), active: pathname.startsWith('/network') },
    { to: '/heatmap', label: m.nav_heatmap(), active: pathname.startsWith('/heatmap') },
    { to: '/events', label: m.nav_events(), active: pathname.startsWith('/events') },
    { to: '/settings', label: m.nav_settings(), active: pathname.startsWith('/settings') },
  ] as const
  return (
    <header className="border-b border-border bg-surface">
      <div className="mx-auto flex max-w-[1360px] flex-wrap items-center gap-x-7 gap-y-3 px-4 py-3 sm:px-8">
        <Link to="/" className="flex items-center gap-2.5 no-underline">
          <Logo />
          <span className="text-base font-bold tracking-tight">{m.app_name()}</span>
        </Link>
        <nav aria-label={m.nav_label()} className="flex flex-wrap gap-1">
          {nav.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              aria-current={item.active ? 'page' : undefined}
              className={cn(navLink, item.active && 'bg-track font-semibold text-foreground')}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {adapters.length === 0 ? (
            <span className="rounded-full border border-border px-[11px] py-[5px] text-xs text-foreground-muted">
              {m.adapter_none()}
            </span>
          ) : (
            adapters.map((adapter) => (
              <span
                key={adapter.id}
                title={adapter.error ?? undefined}
                className="inline-flex items-center gap-[7px] rounded-full border border-border px-[11px] py-[5px] text-xs text-foreground-muted"
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    'size-[7px] rounded-full',
                    adapter.connected ? 'bg-good' : 'bg-weak',
                  )}
                />
                {adapter.label}
                <span className="sr-only">
                  {adapter.connected ? m.adapter_connected() : m.adapter_disconnected()}
                </span>
              </span>
            ))
          )}
          <button
            type="button"
            lang={other}
            aria-label={m.language_switch_label()}
            onClick={() => setLocale(other)}
            className="min-h-10 cursor-pointer rounded-md border border-border bg-surface px-3 text-xs text-foreground-muted hover:bg-track"
          >
            {m.language_switch()}
          </button>
          {info.auth ? (
            <form method="post" action="/auth/logout">
              <button
                type="submit"
                className="min-h-10 cursor-pointer rounded-md border border-border bg-surface px-3 text-xs text-foreground-muted hover:bg-track"
              >
                {m.logout()}
              </button>
            </form>
          ) : null}
        </div>
      </div>
    </header>
  )
}
