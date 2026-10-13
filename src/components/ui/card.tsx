import type { ComponentProps } from 'react'
import { cn } from '~/lib/cn'

export const Card = ({ className, ...props }: ComponentProps<'div'>) => (
  <div className={cn('rounded-[10px] border border-border bg-surface', className)} {...props} />
)

export const CardHeader = ({ className, ...props }: ComponentProps<'div'>) => (
  <div
    className={cn(
      'flex flex-wrap items-center justify-between gap-3 border-b border-border px-[18px] py-3.5',
      className,
    )}
    {...props}
  />
)

export const CardTitle = ({ className, ...props }: ComponentProps<'h2'>) => (
  <h2 className={cn('m-0 text-[15px] font-semibold', className)} {...props} />
)

export const CardHint = ({ className, ...props }: ComponentProps<'p'>) => (
  <p className={cn('mt-0.5 text-xs text-foreground-subtle', className)} {...props} />
)
