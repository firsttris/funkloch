import { ago } from '~/lib/format'
import { m } from '~/paraglide/messages.js'
import type { Overview } from '~/server/views/overview'

type Channels = NonNullable<Overview['channels']>

const MAX_BAR = 82
const MIN_BAR = 6

const networkColor = (protocol: string) =>
  protocol === 'zigbee'
    ? 'var(--zigbee)'
    : protocol === 'thread'
      ? 'var(--thread)'
      : 'var(--foreground-muted)'

const barColor = (bar: Channels['bars'][number]) =>
  bar.network
    ? networkColor(bar.network)
    : bar.busy
      ? 'var(--channel-busy)'
      : 'var(--channel-quiet)'

const Swatch = ({ color }: { color: string }) => (
  <span className="size-2.5 rounded-[2px]" style={{ background: color }} />
)

/** Energy per 2.4 GHz channel from the newest scan, the networks' own channels in their colour */
export const ChannelCard = ({ channels, now }: { channels: Channels; now: number }) => {
  const described = channels.bars
    .map((bar) => `${bar.channel}: ${bar.energy === null ? '–' : `${Math.round(bar.energy)} dBm`}`)
    .join(', ')
  return (
    <section
      aria-labelledby="channels-title"
      className="flex min-w-0 flex-[1_1_420px] flex-col gap-3 rounded-[10px] border border-border bg-surface px-[18px] py-4"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 id="channels-title" className="m-0 text-sm font-semibold">
          {m.energy_title()}
        </h2>
        <span className="text-xs text-foreground-subtle">
          {m.energy_source({ ago: ago(channels.ts, now) })}
        </span>
      </div>
      <div className="flex flex-col gap-1">
        <div
          role="img"
          aria-label={m.energy_label({ values: described })}
          className="flex h-[90px] items-end gap-1 border-b border-border"
        >
          {channels.bars.map((bar) => (
            <div
              key={bar.channel}
              data-channel={bar.channel}
              className="flex-1 rounded-t-[3px]"
              style={{
                height: Math.round(bar.level * MAX_BAR) + MIN_BAR,
                background: barColor(bar),
              }}
            />
          ))}
        </div>
        <div aria-hidden="true" className="flex gap-1">
          {channels.bars.map((bar) => (
            <span
              key={bar.channel}
              className="flex-1 text-center font-mono text-[11px]"
              style={{
                color: bar.network ? networkColor(bar.network) : 'var(--foreground-subtle)',
                fontWeight: bar.network ? 700 : 400,
              }}
            >
              {bar.channel}
            </span>
          ))}
        </div>
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-foreground-muted">
        {channels.networks.map((n) => (
          <span key={n.protocol} className="inline-flex items-center gap-1.5">
            <Swatch color={networkColor(n.protocol)} />
            {m.energy_network({ protocol: n.label, channel: n.channel })}
          </span>
        ))}
        <span className="inline-flex items-center gap-1.5">
          <Swatch color="var(--channel-busy)" />
          {m.energy_busy()}
        </span>
      </div>
    </section>
  )
}
