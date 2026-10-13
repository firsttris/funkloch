import { createFileRoute } from '@tanstack/react-router'
import { m } from '~/paraglide/messages.js'

export const Route = createFileRoute('/')({
  component: () => <h1>{m.app_name()}</h1>,
})
