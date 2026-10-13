// The 2.4 GHz channels 11–26 of IEEE 802.15.4 and what an energy scan says about them.
import type { ProtocolId } from './types'

export const CHANNELS = Array.from({ length: 16 }, (_, i) => 11 + i)

/** Above this a channel is busy, usually because Wi-Fi overlaps it (the mockup's grey bars) */
export const BUSY_DBM = -76
/** The bars run from the noise floor to a strong Wi-Fi network */
const FLOOR_DBM = -100
const TOP_DBM = -55

export type ChannelEnergy = { channel: number; energy: number }

export type ChannelBar = {
  channel: number
  /** dBm, null when the scan has no value for the channel */
  energy: number | null
  /** 0–1 for the height of the bar */
  level: number
  busy: boolean
  /** The protocol whose network runs on this channel */
  network: ProtocolId | null
}

const level = (energy: number) =>
  Math.min(1, Math.max(0, (energy - FLOOR_DBM) / (TOP_DBM - FLOOR_DBM)))

export const channelBars = (
  scan: readonly ChannelEnergy[],
  networks: Readonly<Record<ProtocolId, number>>,
): ChannelBar[] => {
  const energy = new Map(scan.map((c) => [c.channel, c.energy]))
  const byChannel = new Map(Object.entries(networks).map(([protocol, ch]) => [ch, protocol]))
  return CHANNELS.map((channel) => {
    const value = energy.get(channel) ?? null
    return {
      channel,
      energy: value,
      level: value === null ? 0 : level(value),
      busy: value !== null && value > BUSY_DBM,
      network: byChannel.get(channel) ?? null,
    }
  })
}

/**
 * Networks whose channel turned busy with this scan (it was quiet or unknown in the one before),
 * so a noisy channel is reported once, not with every scan.
 */
export const newlyBusy = (
  previous: readonly ChannelEnergy[],
  current: readonly ChannelEnergy[],
  networks: Readonly<Record<ProtocolId, number>>,
) => {
  const before = new Map(previous.map((c) => [c.channel, c.energy]))
  const now = new Map(current.map((c) => [c.channel, c.energy]))
  return Object.entries(networks).flatMap(([protocol, channel]) => {
    const energy = now.get(channel)
    if (energy === undefined || energy <= BUSY_DBM) return []
    const was = before.get(channel)
    return was !== undefined && was > BUSY_DBM ? [] : [{ protocol, channel, energy }]
  })
}
