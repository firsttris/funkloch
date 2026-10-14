// The bottlenecks of the network (core/bottlenecks.ts) as a hint: which weak link many devices
// hang on, and a link to it on the map.
import { Link } from '@tanstack/react-router'
import { TriangleAlert } from 'lucide-react'
import { m } from '~/paraglide/messages.js'
import type { BottleneckView } from '~/server/views/bottlenecks'
import { Card, CardTitle } from './ui/card'

export const BottleneckHint = ({
  bottlenecks,
  onMap = false,
}: {
  bottlenecks: readonly BottleneckView[]
  /** On the map itself the link selects the device instead of opening the map */
  onMap?: boolean
}) =>
  bottlenecks.length === 0 ? null : (
    <Card data-testid="bottleneck" className="flex gap-3 border-weak/40 px-[18px] py-4">
      <TriangleAlert aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-weak" />
      <div className="flex min-w-0 flex-col gap-2">
        <CardTitle>{m.bottleneck_title()}</CardTitle>
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {bottlenecks.map((b) => (
            <li key={`${b.protocol}-${b.child.id}`} className="text-[14px] leading-relaxed">
              {m.bottleneck_text({
                count: b.devices,
                child: b.child.name,
                parent: b.parent.name,
                link: b.link,
              })}{' '}
              {m.bottleneck_advice()}{' '}
              <Link
                to="/network"
                search={{ protocol: b.protocol, device: b.child.id }}
                replace={onMap}
                resetScroll={!onMap}
                className="font-medium whitespace-nowrap"
              >
                {m.bottleneck_show()}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </Card>
  )
