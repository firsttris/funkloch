import { cva, type VariantProps } from 'class-variance-authority'
import type { ComponentProps } from 'react'
import { cn } from '~/lib/cn'

const badge = cva('inline-flex items-center gap-1.5 rounded-full px-[9px] py-0.5 text-xs', {
  variants: {
    tone: {
      zigbee: 'bg-zigbee-bg font-semibold text-zigbee',
      thread: 'bg-thread-bg font-semibold text-thread',
      wifi: 'bg-wifi-bg font-semibold text-wifi',
      neutral: 'border border-border bg-track font-medium text-foreground-muted',
      weak: 'bg-weak-bg font-semibold text-weak',
    },
  },
  defaultVariants: { tone: 'neutral' },
})

export type BadgeProps = ComponentProps<'span'> & VariantProps<typeof badge>

export const Badge = ({ className, tone, ...props }: BadgeProps) => (
  <span className={cn(badge({ tone }), className)} {...props} />
)
