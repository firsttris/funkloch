import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { AuthCard } from '~/components/auth-card'
import { Button, TextField } from '~/components/ui/field'
import { m } from '~/paraglide/messages.js'

const searchSchema = z.object({
  error: z.enum(['too_short', 'too_long', 'mismatch']).optional().catch(undefined),
})

export const Route = createFileRoute('/setup')({
  validateSearch: searchSchema,
  head: () => ({ meta: [{ title: `${m.setup_title()} · Funkloch` }] }),
  component: SetupPage,
})

const ERRORS = {
  too_short: m.password_too_short,
  too_long: m.password_too_long,
  mismatch: m.password_mismatch,
}

// The first start: set the admin password (argon2id); posted to /auth/setup
function SetupPage() {
  const { error } = Route.useSearch()
  return (
    <AuthCard title={m.setup_title()} text={m.setup_text()}>
      <form method="post" action="/auth/setup" className="flex flex-col gap-3">
        <TextField
          id="password"
          name="password"
          type="password"
          label={m.setup_password()}
          autoComplete="new-password"
          minLength={10}
          required
          autoFocus
        />
        <TextField
          id="repeat"
          name="repeat"
          type="password"
          label={m.setup_repeat()}
          autoComplete="new-password"
          required
        />
        {error ? (
          <p role="alert" className="m-0 text-[13px] text-weak">
            {ERRORS[error]()}
          </p>
        ) : null}
        <Button type="submit" variant="primary">
          {m.setup_submit()}
        </Button>
      </form>
    </AuthCard>
  )
}
