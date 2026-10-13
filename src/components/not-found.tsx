import { Link } from '@tanstack/react-router'
import { m } from '~/paraglide/messages.js'

export const NotFound = () => (
  <main className="mx-auto flex max-w-[1360px] flex-col gap-3 px-4 py-12 sm:px-8">
    <h1 className="m-0 text-2xl font-bold">{m.not_found_title()}</h1>
    <p className="text-foreground-subtle">{m.not_found_text()}</p>
    <Link to="/">{m.back_all()}</Link>
  </main>
)
