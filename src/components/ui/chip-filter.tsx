import { cn } from '~/lib/cn'

/** Filter buttons that show which one is on, as in the mockup's protocol filter. */
export const ChipFilter = <T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: T
  options: { value: T; label: string }[]
  onChange: (value: T) => void
}) => (
  // biome-ignore lint/a11y/useSemanticElements: a group of toggle buttons, not a form fieldset
  <div role="group" aria-label={label} className="flex flex-wrap gap-1.5">
    {options.map((option) => {
      const pressed = option.value === value
      return (
        <button
          key={option.value}
          type="button"
          aria-pressed={pressed}
          onClick={() => onChange(option.value)}
          className={cn(
            'min-h-10 cursor-pointer rounded-md border px-3.5',
            pressed
              ? 'border-primary bg-primary font-semibold text-primary-foreground'
              : 'border-border bg-surface text-foreground-muted hover:bg-track',
          )}
        >
          {option.label}
        </button>
      )
    })}
  </div>
)
