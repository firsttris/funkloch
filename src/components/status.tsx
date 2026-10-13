import type { Status } from '~/core/types'
import { cn } from '~/lib/cn'
import { statusBg, statusColor, statusLabel } from './labels'

export const StatusDot = ({ status, className }: { status: Status; className?: string }) => (
  <span
    aria-hidden="true"
    className={cn('size-2 shrink-0 rounded-full', statusBg[status], className)}
  />
)

export const StatusLabel = ({ status }: { status: Status }) => (
  <span className={cn('inline-flex items-center gap-2 font-medium', statusColor[status])}>
    <StatusDot status={status} />
    {statusLabel(status)}
  </span>
)
