import type { ReactNode } from 'react'
import { cn } from '~/lib/cn'

export const KpiCard = ({
  label,
  value,
  hint,
  tone,
  size = 'lg',
}: {
  label: string
  value: ReactNode
  hint?: ReactNode
  tone?: 'weak'
  size?: 'lg' | 'md'
}) => (
  <div className="flex flex-col gap-1 rounded-[10px] border border-border bg-surface px-[18px] py-4">
    <span className="text-[13px] text-foreground-subtle">{label}</span>
    <span
      className={cn(
        'font-mono font-semibold tracking-tight',
        size === 'lg' ? 'text-[32px] leading-tight' : 'text-[28px] leading-tight',
        tone === 'weak' && 'text-weak',
      )}
    >
      {value}
    </span>
    {hint ? <span className="text-xs text-foreground-subtle">{hint}</span> : null}
  </div>
)
