// Transmit errors of a Thread router per hour (own SVG like the messages chart): bars from the
// threshold on in red, the threshold as a dashed line across them.
import { dateTime, number } from '~/lib/format'
import { m } from '~/paraglide/messages.js'
import type { DeviceDetail } from '~/server/views/device'
import { Card, CardHint, CardTitle } from './ui/card'

type TxErrors = NonNullable<DeviceDetail['txErrors']>

const WIDTH = 700
const HEIGHT = 120

export const TxErrorsCard = ({ txErrors, now }: { txErrors: TxErrors; now: number }) => {
  const { hourly, threshold } = txErrors
  const highest = Math.max(0, ...hourly.map((v) => v ?? 0))
  const top = Math.max(threshold * 2, highest)
  const barWidth = WIDTH / Math.max(hourly.length, 1)
  const y = (value: number) => HEIGHT - (value / top) * (HEIGHT - 6)
  return (
    <Card className="flex flex-col gap-3 px-[18px] pt-4 pb-[18px]">
      <div>
        <CardTitle>{m.tx_errors_title()}</CardTitle>
        <CardHint>{m.tx_errors_hint()}</CardHint>
      </div>
      <div className="flex flex-col">
        <svg
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          preserveAspectRatio="none"
          className="block h-[120px] w-full"
          role="img"
          aria-label={m.tx_errors_aria({ max: number(highest, 1) })}
        >
          {hourly.map((value, i) => {
            const x = i * barWidth
            if (value === null || value === 0) return null
            return (
              <rect
                key={`bar-${x}`}
                x={x + 0.5}
                y={y(value)}
                width={Math.max(barWidth - 1, 1)}
                height={HEIGHT - y(value)}
                fill={value >= threshold ? 'var(--status-weak)' : 'var(--chart-bar)'}
              />
            )
          })}
          <line
            x1="0"
            x2={WIDTH}
            y1={y(threshold)}
            y2={y(threshold)}
            stroke="var(--foreground-subtle)"
            strokeDasharray="4 4"
            vectorEffect="non-scaling-stroke"
          />
          <line
            x1="0"
            x2={WIDTH}
            y1={HEIGHT - 0.5}
            y2={HEIGHT - 0.5}
            stroke="var(--chart-axis)"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
        <div
          aria-hidden="true"
          className="mt-1.5 flex justify-between font-mono text-[11px] text-foreground-subtle"
        >
          <span>{dateTime(txErrors.from)}</span>
          <span>{m.tx_errors_threshold({ threshold: number(threshold) })}</span>
          <span>{dateTime(now)}</span>
        </div>
      </div>
    </Card>
  )
}
