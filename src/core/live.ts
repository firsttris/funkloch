// What changed between two looks at the database, as the live stream reports it.
export type Fingerprint = { sample: number; event: number; snapshot: number; device: number }

export type Change = { samples: boolean; events: boolean; topology: boolean; devices: boolean }

export const changes = (before: Fingerprint, after: Fingerprint): Change | null => {
  const change = {
    samples: after.sample !== before.sample,
    events: after.event !== before.event,
    topology: after.snapshot !== before.snapshot,
    devices: after.device !== before.device,
  }
  return Object.values(change).some(Boolean) ? change : null
}

/** The query keys a change makes stale on the client */
export const staleKeys = (change: Change): string[] => [
  ...(change.samples || change.devices ? ['overview', 'device'] : []),
  ...(change.events ? ['events', 'device', 'heatmap'] : []),
  ...(change.topology ? ['network', 'device'] : []),
]
