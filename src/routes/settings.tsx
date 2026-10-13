import { queryOptions, useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { type FormEvent, type ReactNode, useEffect, useState } from 'react'
import { AppHeader } from '~/components/app-header'
import { roleLabel } from '~/components/labels'
import { Card, CardHint, CardTitle } from '~/components/ui/card'
import { Button, inputClass, TextField } from '~/components/ui/field'
import type { Settings } from '~/core/settings'
import type { Role } from '~/core/types'
import { cn } from '~/lib/cn'
import { ago, number } from '~/lib/format'
import { m } from '~/paraglide/messages.js'
import { changePassword, getSettingsPage, renameDevice } from '~/server/fn/admin'
import { updateSettings } from '~/server/fn/settings'

const settingsPageQuery = queryOptions({
  queryKey: ['settings-page'],
  queryFn: () => getSettingsPage(),
})

export const Route = createFileRoute('/settings')({
  loader: ({ context }) => context.queryClient.ensureQueryData(settingsPageQuery),
  head: () => ({ meta: [{ title: `${m.settings_title()} · Funkloch` }] }),
  component: SettingsPage,
})

const bytes = (value: number) =>
  value >= 1024 ** 3
    ? `${number(value / 1024 ** 3, 1)} GB`
    : value >= 1024 ** 2
      ? `${number(value / 1024 ** 2, 1)} MB`
      : `${number(value / 1024)} KB`

const Section = ({
  title,
  hint,
  children,
}: {
  title: string
  hint?: string
  children: ReactNode
}) => (
  <Card className="flex flex-col gap-3 px-[18px] py-4">
    <div>
      <CardTitle>{title}</CardTitle>
      {hint ? <CardHint>{hint}</CardHint> : null}
    </div>
    {children}
  </Card>
)

const NumberField = ({
  id,
  label,
  value,
  min,
  max,
  step = 1,
  hint,
  onChange,
}: {
  id: string
  label: string
  value: number
  min: number
  max: number
  step?: number
  hint?: string
  onChange: (value: number) => void
}) => (
  <TextField
    id={id}
    label={label}
    type="number"
    min={min}
    max={max}
    step={step}
    value={value}
    hint={hint}
    onChange={(event) => onChange(Number(event.target.value))}
  />
)

const Status = ({ result }: { result: { ok: boolean; text: string } | null }) =>
  result ? (
    <p role="status" className={cn('m-0 text-[13px]', result.ok ? 'text-good' : 'text-weak')}>
      {result.text}
    </p>
  ) : null

function SettingsPage() {
  const queryClient = useQueryClient()
  const { data } = useSuspenseQuery(settingsPageQuery)
  const [draft, setDraft] = useState<Settings>(data.settings)
  useEffect(() => setDraft(data.settings), [data.settings])
  const now = Date.now()

  const save = useMutation({
    mutationFn: () => updateSettings({ data: { settings: draft } }),
    onSuccess: (result) => {
      if (!result.ok) return
      queryClient.invalidateQueries({ queryKey: ['settings-page'] })
      queryClient.invalidateQueries({ queryKey: ['settings'] })
      // thresholds change the traffic lights everywhere
      for (const key of ['overview', 'device', 'heatmap', 'network'])
        queryClient.invalidateQueries({ queryKey: [key] })
    },
  })

  const onSave = (event: FormEvent) => {
    event.preventDefault()
    save.mutate()
  }

  return (
    <div className="min-h-screen">
      <AppHeader adapters={data.adapters} />
      <main className="mx-auto flex max-w-[1360px] flex-col gap-5 px-4 pt-7 pb-12 sm:px-8">
        <div>
          <h1 className="m-0 text-[26px] font-bold tracking-tight">{m.settings_title()}</h1>
          <p className="mt-1 text-foreground-subtle">{m.settings_subtitle()}</p>
        </div>

        <div className="grid grid-cols-[repeat(auto-fit,minmax(320px,1fr))] items-start gap-4">
          <Section title={m.settings_adapters()} hint={m.settings_adapters_hint()}>
            <ul className="m-0 flex list-none flex-col gap-2 p-0">
              {data.adapters.map((adapter) => (
                <li
                  key={adapter.id}
                  className="flex items-center justify-between gap-3 text-[13px]"
                >
                  <span className="inline-flex items-center gap-2 font-semibold">
                    <span
                      className={cn(
                        'size-2 rounded-full',
                        adapter.connected ? 'bg-good' : 'bg-weak',
                      )}
                    />
                    {adapter.label}
                  </span>
                  <span className="text-foreground-muted">
                    {adapter.connected
                      ? m.settings_adapter_connected({ ago: ago(adapter.since, now) })
                      : (adapter.error ?? m.settings_adapter_disconnected())}
                  </span>
                </li>
              ))}
              {data.adapters.length === 0 ? (
                <li className="text-[13px] text-foreground-muted">{m.adapter_none()}</li>
              ) : null}
            </ul>
            <p className="m-0 text-xs text-foreground-subtle">
              {m.settings_database({ size: bytes(data.databaseBytes), dir: data.dataDir })}
            </p>
          </Section>

          <form onSubmit={onSave} className="contents">
            <Section title={m.settings_signal()} hint={m.settings_signal_hint()}>
              <div className="grid grid-cols-2 gap-3">
                <NumberField
                  id="good"
                  label={m.settings_good()}
                  value={draft.thresholds.good}
                  min={1}
                  max={100}
                  onChange={(good) =>
                    setDraft((d) => ({ ...d, thresholds: { ...d.thresholds, good } }))
                  }
                />
                <NumberField
                  id="weak"
                  label={m.settings_weak()}
                  value={draft.thresholds.weak}
                  min={0}
                  max={99}
                  onChange={(weak) =>
                    setDraft((d) => ({ ...d, thresholds: { ...d.thresholds, weak } }))
                  }
                />
              </div>
              <NumberField
                id="networkmap"
                label={m.settings_networkmap()}
                hint={m.settings_networkmap_hint()}
                value={draft.networkmapHours}
                min={1}
                max={168}
                onChange={(networkmapHours) => setDraft((d) => ({ ...d, networkmapHours }))}
              />
              <div className="grid grid-cols-2 gap-3">
                <NumberField
                  id="samples-days"
                  label={m.settings_samples_days()}
                  value={draft.retention.samplesDays}
                  min={2}
                  max={90}
                  onChange={(samplesDays) =>
                    setDraft((d) => ({ ...d, retention: { ...d.retention, samplesDays } }))
                  }
                />
                <NumberField
                  id="hourly-days"
                  label={m.settings_hourly_days()}
                  value={draft.retention.hourlyDays}
                  min={30}
                  max={3650}
                  onChange={(hourlyDays) =>
                    setDraft((d) => ({ ...d, retention: { ...d.retention, hourlyDays } }))
                  }
                />
              </div>
              <Button
                type="submit"
                variant="primary"
                disabled={save.isPending}
                className="self-start"
              >
                {m.settings_save()}
              </Button>
              <Status
                result={
                  save.data
                    ? {
                        ok: save.data.ok,
                        text: save.data.ok
                          ? m.settings_saved()
                          : m.settings_save_failed({ error: save.data.error }),
                      }
                    : null
                }
              />
            </Section>
          </form>

          <PasswordSection auth={data.auth} />
        </div>

        <Section title={m.settings_names()} hint={m.settings_names_hint()}>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-[13px]">
              <thead>
                <tr className="text-left text-xs text-foreground-subtle">
                  <th scope="col" className="py-2 font-medium">
                    {m.col_device()}
                  </th>
                  <th scope="col" className="py-2 font-medium">
                    {m.col_protocol()}
                  </th>
                  <th scope="col" className="py-2 font-medium">
                    {m.detail_address()}
                  </th>
                  <th scope="col" className="py-2 font-medium">
                    {m.settings_names()}
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.devices.map((device) => (
                  <NameRow key={device.id} device={device} />
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      </main>
    </div>
  )
}

type Device = Awaited<ReturnType<typeof getSettingsPage>>['devices'][number]

const NameRow = ({ device }: { device: Device }) => {
  const queryClient = useQueryClient()
  const [name, setName] = useState(device.customName ?? '')
  const rename = useMutation({
    mutationFn: () => renameDevice({ data: { id: device.id, name } }),
    onSuccess: () => {
      for (const key of ['settings-page', 'overview', 'device', 'network', 'heatmap', 'events']) {
        queryClient.invalidateQueries({ queryKey: [key] })
      }
    },
  })
  const changed = name.trim() !== (device.customName ?? '')
  return (
    <tr className="border-t border-border-subtle">
      <td className="py-2 pr-3">
        <span className="font-medium">{device.name}</span>
        <span className="block text-xs text-foreground-subtle">
          {roleLabel(device.role as Role)}
        </span>
      </td>
      <td className="py-2 pr-3">{device.protocolLabel}</td>
      <td className="py-2 pr-3 font-mono text-xs">{device.address}</td>
      <td className="py-2">
        <form
          className="flex items-center gap-2"
          onSubmit={(event) => {
            event.preventDefault()
            rename.mutate()
          }}
        >
          <input
            aria-label={m.settings_name_for({ name: device.name })}
            value={name}
            maxLength={100}
            placeholder={device.name}
            onChange={(event) => setName(event.target.value)}
            className={cn(inputClass, 'w-full max-w-64')}
          />
          <Button type="submit" disabled={!changed || rename.isPending}>
            {m.settings_save()}
          </Button>
          {rename.isSuccess && !changed ? (
            <span role="status" className="text-xs text-good">
              {m.settings_name_saved()}
            </span>
          ) : null}
        </form>
      </td>
    </tr>
  )
}

const PASSWORD_ERRORS = {
  wrong: m.settings_password_wrong,
  too_short: m.password_too_short,
  too_long: m.password_too_long,
  mismatch: m.password_mismatch,
}

const PasswordSection = ({ auth }: { auth: boolean }) => {
  const [fields, setFields] = useState({ current: '', password: '', repeat: '' })
  const change = useMutation({
    mutationFn: () => changePassword({ data: fields }),
    onSuccess: (result) => {
      if (result.ok) setFields({ current: '', password: '', repeat: '' })
    },
  })
  if (!auth) {
    return (
      <Section title={m.settings_password()}>
        <p className="m-0 text-[13px] text-foreground-muted">{m.settings_password_demo()}</p>
      </Section>
    )
  }
  return (
    <form
      className="contents"
      onSubmit={(event) => {
        event.preventDefault()
        change.mutate()
      }}
    >
      <Section title={m.settings_password()}>
        <TextField
          id="current-password"
          type="password"
          autoComplete="current-password"
          label={m.settings_password_current()}
          value={fields.current}
          onChange={(e) => setFields((f) => ({ ...f, current: e.target.value }))}
          required
        />
        <TextField
          id="new-password"
          type="password"
          autoComplete="new-password"
          label={m.settings_password_new()}
          value={fields.password}
          onChange={(e) => setFields((f) => ({ ...f, password: e.target.value }))}
          required
        />
        <TextField
          id="repeat-password"
          type="password"
          autoComplete="new-password"
          label={m.settings_password_repeat()}
          value={fields.repeat}
          onChange={(e) => setFields((f) => ({ ...f, repeat: e.target.value }))}
          required
        />
        <Button type="submit" variant="primary" disabled={change.isPending} className="self-start">
          {m.settings_password()}
        </Button>
        <Status
          result={
            change.data
              ? {
                  ok: change.data.ok,
                  text: change.data.ok
                    ? m.settings_password_changed()
                    : PASSWORD_ERRORS[change.data.error](),
                }
              : null
          }
        />
      </Section>
    </form>
  )
}
