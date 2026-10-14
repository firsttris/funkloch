// Rules and channels for notifications, as in the mockup's events page. Plain controlled inputs;
// the server validates the whole settings object and answers with what is wrong.
import { queryOptions, useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import type { Settings } from '~/core/settings'
import { m } from '~/paraglide/messages.js'
import { getSettings, sendTestNotification, updateSettings } from '~/server/fn/settings'
import { Card, CardTitle } from './ui/card'
import { Button, Checkbox, inputClass, TextField } from './ui/field'

export const settingsQuery = queryOptions({ queryKey: ['settings'], queryFn: () => getSettings() })

type Rules = Settings['rules']
type Channels = Settings['channels']

const MinutesInput = ({
  label,
  value,
  min,
  disabled,
  onChange,
}: {
  label: string
  value: number
  min: number
  disabled: boolean
  onChange: (value: number) => void
}) => (
  <input
    type="number"
    aria-label={label}
    min={min}
    max={1440}
    value={value}
    disabled={disabled}
    onChange={(event) => onChange(Number(event.target.value))}
    className={`${inputClass} w-20`}
  />
)

export const NotificationSettings = () => {
  const queryClient = useQueryClient()
  const { data } = useSuspenseQuery(settingsQuery)
  const [draft, setDraft] = useState<Settings>(data.settings)
  useEffect(() => setDraft(data.settings), [data.settings])

  const setRules = (rules: Partial<Rules>) =>
    setDraft((d) => ({ ...d, rules: { ...d.rules, ...rules } }))
  const setChannels = (channels: Partial<Channels>) =>
    setDraft((d) => ({ ...d, channels: { ...d.channels, ...channels } }))
  const { rules, channels } = draft

  const save = useMutation({
    mutationFn: () => updateSettings({ data: { settings: draft } }),
    onSuccess: (result) => {
      if (result.ok) queryClient.invalidateQueries({ queryKey: ['settings'] })
    },
  })
  const test = useMutation({ mutationFn: () => sendTestNotification() })

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault()
        save.mutate()
      }}
    >
      <Card className="flex flex-col gap-1 px-[18px] py-4">
        <CardTitle className="mb-2">{m.rules_title()}</CardTitle>
        <Checkbox
          label={m.rule_offline_label()}
          checked={rules.offline.enabled}
          onChange={(e) => setRules({ offline: { ...rules.offline, enabled: e.target.checked } })}
        >
          <MinutesInput
            label={m.rule_offline_minutes()}
            value={rules.offline.minutes}
            min={5}
            disabled={!rules.offline.enabled}
            onChange={(minutes) => setRules({ offline: { ...rules.offline, minutes } })}
          />
          <span className="text-foreground-subtle">min</span>
        </Checkbox>
        <Checkbox
          label={m.rule_signal_label()}
          checked={rules.signal.enabled}
          onChange={(e) => setRules({ signal: { ...rules.signal, enabled: e.target.checked } })}
        >
          <MinutesInput
            label={m.rule_signal_minutes()}
            value={rules.signal.minutes}
            min={30}
            disabled={!rules.signal.enabled}
            onChange={(minutes) => setRules({ signal: { ...rules.signal, minutes } })}
          />
          <span className="text-foreground-subtle">min</span>
        </Checkbox>
        <Checkbox
          label={m.rule_trend()}
          checked={rules.trend.enabled}
          onChange={(e) => setRules({ trend: { enabled: e.target.checked } })}
        />
        <Checkbox
          label={m.rule_pattern()}
          checked={rules.pattern.enabled}
          onChange={(e) => setRules({ pattern: { enabled: e.target.checked } })}
        />
        <Checkbox
          label={m.rule_transmit()}
          checked={rules.transmit.enabled}
          onChange={(e) => setRules({ transmit: { enabled: e.target.checked } })}
        />
        <Checkbox
          label={m.rule_topology()}
          checked={rules.topology.enabled}
          onChange={(e) => setRules({ topology: { enabled: e.target.checked } })}
        />
        <Checkbox
          label={m.rule_network()}
          checked={rules.network.enabled}
          onChange={(e) => setRules({ network: { enabled: e.target.checked } })}
        />
      </Card>

      <Card className="flex flex-col gap-3 px-[18px] py-4">
        <CardTitle>{m.channels_title()}</CardTitle>
        <TextField
          id="ntfy-server"
          label={m.channel_ntfy_server()}
          type="url"
          value={channels.ntfy.server}
          onChange={(e) => setChannels({ ntfy: { ...channels.ntfy, server: e.target.value } })}
        />
        <TextField
          id="ntfy-topic"
          label={m.channel_ntfy_topic()}
          value={channels.ntfy.topic}
          onChange={(e) => setChannels({ ntfy: { ...channels.ntfy, topic: e.target.value } })}
        />
        <TextField
          id="ntfy-token"
          label={m.channel_ntfy_token()}
          type="password"
          autoComplete="off"
          value={channels.ntfy.token}
          onChange={(e) => setChannels({ ntfy: { ...channels.ntfy, token: e.target.value } })}
        />
        <TextField
          id="webhook"
          label={m.channel_webhook()}
          type="url"
          placeholder="https://"
          value={channels.webhook.url}
          onChange={(e) => setChannels({ webhook: { url: e.target.value } })}
        />
        <Checkbox
          label={m.channel_mqtt()}
          checked={channels.mqtt.enabled}
          disabled={!data.mqttAvailable}
          onChange={(e) => setChannels({ mqtt: { ...channels.mqtt, enabled: e.target.checked } })}
        />
        {data.mqttAvailable ? (
          <TextField
            id="mqtt-topic"
            label={m.channel_mqtt_topic()}
            value={channels.mqtt.topic}
            disabled={!channels.mqtt.enabled}
            onChange={(e) => setChannels({ mqtt: { ...channels.mqtt, topic: e.target.value } })}
          />
        ) : (
          <span className="text-xs text-foreground-subtle">{m.channel_mqtt_unavailable()}</span>
        )}
        <div className="flex flex-col gap-1">
          <label htmlFor="language" className="text-xs font-medium text-foreground-muted">
            {m.notify_language()}
          </label>
          <select
            id="language"
            value={draft.language}
            onChange={(e) =>
              setDraft((d) => ({ ...d, language: e.target.value as Settings['language'] }))
            }
            className={inputClass}
          >
            <option value="de">Deutsch</option>
            <option value="en">English</option>
          </select>
        </div>
        <TextField
          id="public-url"
          label={m.notify_public_url()}
          type="url"
          placeholder="http://funkloch.local:8090"
          value={draft.publicUrl}
          onChange={(e) => setDraft((d) => ({ ...d, publicUrl: e.target.value }))}
        />
        <div className="flex flex-wrap gap-2">
          <Button type="submit" variant="primary" disabled={save.isPending}>
            {m.settings_save()}
          </Button>
          <Button disabled={test.isPending} onClick={() => test.mutate()}>
            {m.notify_test()}
          </Button>
        </div>
        <div role="status" className="flex flex-col gap-0.5 text-[13px]">
          {save.data?.ok ? <span className="text-good">{m.settings_saved()}</span> : null}
          {save.data && !save.data.ok ? (
            <span className="text-weak">{m.settings_save_failed({ error: save.data.error })}</span>
          ) : null}
          {test.data && test.data.results.length === 0 ? (
            <span className="text-foreground-muted">{m.notify_test_none()}</span>
          ) : null}
          {test.data?.results.map((r) =>
            r.ok ? (
              <span key={r.channel} className="text-good">
                {m.notify_test_ok({ channel: r.channel })}
              </span>
            ) : (
              <span key={r.channel} className="text-weak">
                {m.notify_test_failed({ channel: r.channel, error: r.error ?? '' })}
              </span>
            ),
          )}
        </div>
      </Card>
    </form>
  )
}
