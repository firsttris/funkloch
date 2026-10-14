// The device's name as the page heading, with a pencil to give it a name of its own right there:
// Thread devices without an SRP host name are otherwise known by their address only.
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Pencil } from 'lucide-react'
import { useState } from 'react'
import { cn } from '~/lib/cn'
import { m } from '~/paraglide/messages.js'
import { renameDevice } from '~/server/fn/admin'
import { Button, inputClass } from './ui/field'

/** The pages that show device names */
const NAMED = ['settings-page', 'overview', 'device', 'network', 'heatmap', 'events']

export const DeviceTitle = ({
  id,
  name,
  customName,
  networkName,
}: {
  id: number
  name: string
  customName: string | null
  /** The name the network gives it, shown while the own name is empty */
  networkName: string
}) => {
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(customName ?? '')
  const rename = useMutation({
    mutationFn: () => renameDevice({ data: { id, name: draft } }),
    onSuccess: async () => {
      await Promise.all(NAMED.map((key) => queryClient.invalidateQueries({ queryKey: [key] })))
      setEditing(false)
    },
  })

  if (!editing) {
    return (
      <div className="flex items-center gap-2">
        <h1 className="m-0 text-[28px] font-bold tracking-tight">{name}</h1>
        <button
          type="button"
          onClick={() => {
            setDraft(customName ?? '')
            setEditing(true)
          }}
          aria-label={m.device_rename()}
          title={m.device_rename()}
          className="flex size-8 cursor-pointer items-center justify-center rounded-md text-foreground-subtle hover:bg-track hover:text-foreground"
        >
          <Pencil aria-hidden="true" className="size-4" />
        </button>
      </div>
    )
  }

  return (
    <form
      className="flex flex-wrap items-center gap-2"
      onSubmit={(event) => {
        event.preventDefault()
        rename.mutate()
      }}
    >
      <input
        aria-label={m.settings_name_for({ name: networkName })}
        value={draft}
        maxLength={100}
        placeholder={networkName}
        // biome-ignore lint/a11y/noAutofocus: the field appears because the pencil was pressed
        autoFocus
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') setEditing(false)
        }}
        className={cn(inputClass, 'w-full max-w-96 text-[15px]')}
      />
      <Button type="submit" variant="primary" disabled={rename.isPending}>
        {m.settings_save()}
      </Button>
      <Button onClick={() => setEditing(false)}>{m.device_rename_cancel()}</Button>
      <span className="w-full text-xs text-foreground-subtle">{m.device_rename_hint()}</span>
    </form>
  )
}
