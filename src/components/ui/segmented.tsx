import { ToggleGroup } from 'radix-ui'
import { cn } from '~/lib/cn'

type Option<T extends string> = { value: T; label: string }

/** A single choice out of a few, like the time range: a Radix toggle group in the mockup's look. */
export const Segmented = <T extends string>({
  label,
  value,
  options,
  onChange,
  size = 'md',
}: {
  label: string
  value: T
  options: Option<T>[]
  onChange: (value: T) => void
  size?: 'sm' | 'md'
}) => (
  <ToggleGroup.Root
    type="single"
    aria-label={label}
    value={value}
    onValueChange={(next) => next && onChange(next as T)}
    className="inline-flex gap-0.5 rounded-lg bg-border p-[3px]"
  >
    {options.map((option) => (
      <ToggleGroup.Item
        key={option.value}
        value={option.value}
        className={cn(
          'cursor-pointer rounded-md border-0 bg-transparent text-foreground-muted',
          'data-[state=on]:bg-surface data-[state=on]:font-semibold data-[state=on]:text-foreground',
          'focus-visible:outline-2 focus-visible:outline-primary',
          size === 'md' ? 'min-h-10 px-3.5' : 'min-h-9 px-3',
        )}
      >
        {option.label}
      </ToggleGroup.Item>
    ))}
  </ToggleGroup.Root>
)
