import type { ReactNode } from 'react'
import { m } from '~/paraglide/messages.js'
import { Card } from './ui/card'

/** The narrow card of the login and setup pages */
export const AuthCard = ({
  title,
  text,
  children,
}: {
  title: string
  text?: string
  children: ReactNode
}) => (
  <main className="flex min-h-screen items-center justify-center px-4">
    <Card className="flex w-full max-w-sm flex-col gap-4 px-6 py-7">
      <div className="flex items-center gap-2.5">
        <img src="/favicon.svg" alt="" width={28} height={28} />
        <span className="text-base font-bold tracking-tight">{m.app_name()}</span>
      </div>
      <div>
        <h1 className="m-0 text-xl font-bold">{title}</h1>
        {text ? <p className="mt-1 text-[13px] text-foreground-muted">{text}</p> : null}
      </div>
      {children}
    </Card>
  </main>
)
