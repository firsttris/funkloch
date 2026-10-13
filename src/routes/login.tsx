import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { AuthCard } from '~/components/auth-card'
import { Button, TextField } from '~/components/ui/field'
import { m } from '~/paraglide/messages.js'

const searchSchema = z.object({
  error: z.enum(['wrong', 'throttled']).optional().catch(undefined),
  next: z.string().max(2000).optional().catch(undefined),
})

export const Route = createFileRoute('/login')({
  validateSearch: searchSchema,
  head: () => ({ meta: [{ title: `${m.login_title()} · Funkloch` }] }),
  component: LoginPage,
})

// A plain form posted to /auth/login (src/server/auth.ts), so signing in needs no JavaScript
function LoginPage() {
  const { error, next } = Route.useSearch()
  return (
    <AuthCard title={m.login_title()}>
      <form method="post" action="/auth/login" className="flex flex-col gap-3">
        <input type="hidden" name="next" value={next ?? '/'} />
        <TextField
          id="password"
          name="password"
          type="password"
          label={m.login_password()}
          autoComplete="current-password"
          required
          autoFocus
        />
        {error ? (
          <p role="alert" className="m-0 text-[13px] text-weak">
            {error === 'wrong' ? m.login_error_wrong() : m.login_error_throttled()}
          </p>
        ) : null}
        <Button type="submit" variant="primary">
          {m.login_submit()}
        </Button>
      </form>
    </AuthCard>
  )
}
