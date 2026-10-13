import { type ErrorComponentProps, Link } from '@tanstack/react-router'
import { m } from '~/paraglide/messages.js'

const Message = ({ title, text, detail }: { title: string; text: string; detail?: string }) => (
  <main className="mx-auto flex max-w-[1360px] flex-col gap-3 px-4 py-12 sm:px-8">
    <h1 className="m-0 text-2xl font-bold">{title}</h1>
    <p className="m-0 text-foreground-subtle">{text}</p>
    {detail ? <pre className="m-0 font-mono text-xs text-foreground-subtle">{detail}</pre> : null}
    <Link to="/">{m.back_all()}</Link>
  </main>
)

/** An unknown device */
export const NotFound = () => <Message title={m.not_found_title()} text={m.not_found_text()} />

/** Any other unknown address */
export const PageNotFound = () => (
  <Message title={m.page_not_found_title()} text={m.page_not_found_text()} />
)

/** A page that failed to load, e.g. while the server restarts */
export const ErrorPage = ({ error }: ErrorComponentProps) => (
  <Message
    title={m.error_title()}
    text={m.error_text()}
    detail={error instanceof Error ? error.message : String(error)}
  />
)
