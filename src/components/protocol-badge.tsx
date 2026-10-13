import { Badge } from './ui/badge'

const tone = (protocol: string) =>
  protocol === 'zigbee' ? 'zigbee' : protocol === 'thread' ? 'thread' : 'neutral'

export const ProtocolBadge = ({ protocol, label }: { protocol: string; label: string }) => (
  <Badge tone={tone(protocol)}>{label}</Badge>
)
