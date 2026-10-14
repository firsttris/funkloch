// "Is this router doing its job?": the finding of core/router-finding.ts as a few sentences, with
// the numbers it rests on.
import { Route } from 'lucide-react'
import { ago, number } from '~/lib/format'
import { findingSentences } from '~/lib/texts'
import { m } from '~/paraglide/messages.js'
import type { DeviceDetail } from '~/server/views/device'
import { Card, CardHint, CardTitle } from './ui/card'

type Finding = NonNullable<DeviceDetail['finding']>

const Fact = ({ label, value }: { label: string; value: string }) => (
  <div>
    <dt className="text-xs text-foreground-subtle">{label}</dt>
    <dd className="m-0 mt-0.5 font-mono text-[13px]">{value}</dd>
  </div>
)

export const RouterFindingCard = ({
  finding,
  topologyTs,
  txErrorRate,
  now,
}: {
  finding: Finding
  topologyTs: number | null
  /** The transmit error rate of the last day in percent, when it is marked as high */
  txErrorRate: number | null
  now: number
}) => {
  const weak = finding.advice === 'move_towards_root' || finding.advice === 'strengthen_uplink'
  return (
    <Card
      data-testid="router-finding"
      className="flex flex-col gap-3 px-[18px] pt-4 pb-[18px] sm:flex-row sm:gap-6"
    >
      <div className="flex min-w-0 flex-1 gap-3">
        <Route
          aria-hidden="true"
          className={weak ? 'mt-0.5 size-5 shrink-0 text-weak' : 'mt-0.5 size-5 shrink-0'}
        />
        <div className="flex min-w-0 flex-col gap-1.5">
          <div>
            <CardTitle>{m.finding_title()}</CardTitle>
            {topologyTs !== null ? (
              <CardHint>{m.links_hint({ ago: ago(topologyTs, now) })}</CardHint>
            ) : null}
          </div>
          <p className="m-0 text-[14px] leading-relaxed">
            {[
              ...findingSentences(finding),
              ...(txErrorRate === null
                ? []
                : [m.finding_tx_errors({ rate: number(txErrorRate, 1) })]),
            ].join(' ')}
          </p>
        </div>
      </div>
      <dl className="m-0 grid shrink-0 grid-cols-3 gap-x-6 gap-y-2 sm:grid-cols-1">
        <Fact label={m.finding_children()} value={number(finding.children)} />
        <Fact label={m.finding_carried()} value={number(finding.carried)} />
        <Fact label={m.finding_uplink()} value={finding.uplink?.text ?? '–'} />
      </dl>
    </Card>
  )
}
