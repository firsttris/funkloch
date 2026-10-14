// The devices a device is linked to in the newest snapshot: parent, children and neighbors, each
// with its traffic light and the link's values.
import { Link } from '@tanstack/react-router'
import { ago, dateTime } from '~/lib/format'
import { m } from '~/paraglide/messages.js'
import type { DeviceDetail } from '~/server/views/device'
import { roleLabel, statusLabel } from './labels'
import { StatusDot } from './status'
import { Card, CardHint, CardTitle } from './ui/card'

export const DeviceLinks = ({ data }: { data: DeviceDetail }) => {
  const children = data.links.filter((l) => l.kind === 'child').length
  return (
    <Card className="flex min-w-0 flex-[1_1_360px] flex-col gap-3 px-[18px] pt-4 pb-[18px]">
      <div>
        <CardTitle>{m.links_title()}</CardTitle>
        {data.topologyTs !== null ? (
          <CardHint>{m.links_hint({ ago: ago(data.topologyTs, data.now) })}</CardHint>
        ) : null}
        {children > 0 ? (
          <p className="m-0 mt-1 text-[13px] font-medium">
            {m.links_children({ count: children })}
          </p>
        ) : null}
      </div>
      {data.links.length === 0 ? (
        <p className="text-foreground-subtle">{m.links_none()}</p>
      ) : (
        <ul className="m-0 flex list-none flex-col p-0">
          {data.links.map((link) => (
            <li
              key={`${link.kind}-${link.id}`}
              className="grid grid-cols-[minmax(0,1fr)_72px] items-center gap-x-3 gap-y-1 border-b border-border-subtle py-[9px]"
            >
              <div className="flex min-w-0 flex-col">
                <span className="inline-flex min-w-0 items-center gap-2">
                  <StatusDot status={link.status} />
                  <Link
                    to="/devices/$id"
                    params={{ id: link.id }}
                    className="truncate font-semibold no-underline"
                  >
                    {link.name}
                  </Link>
                  <span className="sr-only">{statusLabel(link.status)}</span>
                </span>
                <span className="text-xs text-foreground-subtle">
                  {{ parent: m.link_parent, child: m.link_child, neighbor: m.link_neighbor }[
                    link.kind
                  ]({
                    role: roleLabel(link.role),
                  })}
                  {link.since !== null ? ` · ${m.link_since({ date: dateTime(link.since) })}` : ''}
                </span>
              </div>
              <LinkQuality lqi={link.lqi} rssi={link.rssi} protocol={data.device.protocol} />
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

const LinkQuality = ({
  lqi,
  rssi,
  protocol,
}: {
  lqi: number | null
  rssi: number | null
  protocol: string
}) => {
  const max = protocol === 'zigbee' ? 255 : 3
  // Wi-Fi has no link quality: its RSSI from −90 to −50 dBm fills the bar, as its score does
  const share = lqi !== null ? lqi / max : rssi !== null ? (rssi + 90) / 40 : 0
  const pct = Math.round(Math.min(1, Math.max(0, share)) * 100)
  return (
    <div className="flex flex-col items-end gap-1">
      <span className="font-mono text-xs text-foreground-muted">
        {lqi === null ? '–' : `LQI ${lqi}`}
        {rssi !== null ? ` · ${rssi} dBm` : ''}
      </span>
      <div className="h-[5px] w-[72px] overflow-hidden rounded-[3px] bg-track">
        <div
          className="h-[5px]"
          style={{
            width: `${pct}%`,
            background: pct < 25 ? 'var(--status-weak)' : 'var(--status-good)',
          }}
        />
      </div>
    </div>
  )
}
