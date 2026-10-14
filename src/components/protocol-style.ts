// The colour and short tag of each protocol, from the CSS variables in styles.css
type ProtocolStyle = {
  /** The CSS variable of its colour, for charts */
  color: string
  /** Background and text of a small tag */
  chip: string
  /** The tag's text */
  short: string
  tone: 'zigbee' | 'thread' | 'wifi' | 'neutral'
}

const STYLES: Record<string, ProtocolStyle> = {
  zigbee: { color: '--zigbee', chip: 'bg-zigbee-bg text-zigbee', short: 'ZB', tone: 'zigbee' },
  thread: { color: '--thread', chip: 'bg-thread-bg text-thread', short: 'TH', tone: 'thread' },
  wifi: { color: '--wifi', chip: 'bg-wifi-bg text-wifi', short: 'WF', tone: 'wifi' },
}

export const protocolStyle = (protocol: string): ProtocolStyle =>
  STYLES[protocol] ?? {
    color: '--foreground-muted',
    chip: 'bg-track text-foreground-muted',
    short: protocol,
    tone: 'neutral',
  }
