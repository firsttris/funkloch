import { protocolStyle } from './protocol-style'
import { Badge } from './ui/badge'

export const ProtocolBadge = ({ protocol, label }: { protocol: string; label: string }) => (
  <Badge tone={protocolStyle(protocol).tone}>{label}</Badge>
)
