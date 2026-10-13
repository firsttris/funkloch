import type { ComponentProps, ReactNode } from 'react'
import { cn } from '~/lib/cn'

export const inputClass =
  'min-h-10 rounded-md border border-border bg-surface px-2.5 text-[13px] text-foreground focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-60'

export const TextField = ({
  label,
  id,
  className,
  hint,
  ...props
}: ComponentProps<'input'> & { label: string; id: string; hint?: ReactNode }) => (
  <div className="flex flex-col gap-1">
    <label htmlFor={id} className="text-xs font-medium text-foreground-muted">
      {label}
    </label>
    <input id={id} className={cn(inputClass, className)} {...props} />
    {hint ? <span className="text-xs text-foreground-subtle">{hint}</span> : null}
  </div>
)

export const Checkbox = ({
  label,
  className,
  children,
  ...props
}: ComponentProps<'input'> & { label: string; children?: ReactNode }) => (
  <div className={cn('flex min-h-10 items-center gap-2.5 text-[13px]', className)}>
    <label className="flex cursor-pointer items-center gap-2.5">
      <input type="checkbox" className="size-[18px] accent-primary" {...props} />
      {label}
    </label>
    {children}
  </div>
)

export const Button = ({
  variant = 'secondary',
  className,
  ...props
}: ComponentProps<'button'> & { variant?: 'primary' | 'secondary' }) => (
  <button
    type="button"
    className={cn(
      'min-h-10 cursor-pointer rounded-md border px-3.5 font-medium disabled:cursor-wait disabled:opacity-70',
      variant === 'primary'
        ? 'border-primary bg-primary font-semibold text-primary-foreground'
        : 'border-border bg-surface text-foreground hover:bg-track',
      className,
    )}
    {...props}
  />
)
