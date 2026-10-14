// A stand-in for Zigbee2MQTT and the OTBR: the mockup's devices, sending a message now and then.
import type { Adapter, AdapterStatus, ProtocolMeta } from '~/adapters/types'
import type { Observation } from '~/core/types'
import { DEMO_DEVICES } from './devices'
import {
  COUNTER_EVERY,
  type CounterTotals,
  counterStep,
  demoDeviceInfos,
  linksAt,
  measurementAt,
  random,
  scoreAt,
} from './generate'

export const LIVE_EVERY_MS = 3000

export const createDemoAdapter = (meta: ProtocolMeta, clock: () => number = Date.now): Adapter => {
  const status: AdapterStatus = { connected: true, error: null, since: clock() }
  const devices = DEMO_DEVICES.filter((d) => d.protocol === meta.id)
  const online = devices.filter((d) => !(d.offline ?? []).some(([, to]) => to === 0))

  let send: (observation: Observation) => void = () => {}

  const start = (emit: (observation: Observation) => void) => {
    send = emit
    const now = clock()
    emit({
      kind: 'devices',
      protocol: meta.id,
      ts: now,
      devices: demoDeviceInfos(meta.id),
      complete: true,
    })
    emit({ kind: 'bridge', protocol: meta.id, ts: now, online: true })
    const rnd = random(now)
    const timer = setInterval(() => {
      const device = online[Math.floor(rnd() * online.length)]
      if (!device) return
      const ts = clock()
      emit({
        kind: 'measurement',
        measurement: measurementAt(device, ts, scoreAt(device, ts, ts, rnd)),
      })
    }, LIVE_EVERY_MS)
    // The routers' transmit counters, from zero as after a restart, so the rate stays current
    const totals = new Map<string, CounterTotals>()
    const counters = setInterval(() => {
      const ts = clock()
      for (const device of online.filter((d) => d.txErrors !== undefined)) {
        const total = counterStep(
          device,
          totals.get(device.address) ?? { unicast: 0, broadcast: 0, errors: 0 },
          rnd,
        )
        totals.set(device.address, total)
        emit({
          kind: 'counters',
          counters: { protocol: meta.id, address: device.address, ts, ...total },
        })
      }
    }, COUNTER_EVERY)
    return async () => {
      clearInterval(timer)
      clearInterval(counters)
    }
  }

  // The demo answers a map request at once, with the topology of now
  const requestTopology = () => {
    const ts = clock()
    send({ kind: 'topology', topology: { protocol: meta.id, ts, links: linksAt(meta.id, 0, ts) } })
  }

  return { meta, start, status: () => status, requestTopology }
}
