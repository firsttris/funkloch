import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'
import {
  deviceItemSchema,
  devicesSchema,
  diagnosticsSchema,
  energyScanSchema,
  legacyDiagnosticsSchema,
  networkDiagnosticSchema,
} from './schemas'
import {
  fromDiagnostics,
  fromEnergyScan,
  fromLegacyDiagnostics,
  linkQualityFromMargin,
  toDeviceInfo,
} from './translate'

const fixture = (name: string) =>
  JSON.parse(
    readFileSync(join(import.meta.dirname, '../../../tests/fixtures/otbr-spec', name), 'utf8'),
  )

const devices = devicesSchema.parse(fixture('devices.json')).data
const collection = diagnosticsSchema.parse(fixture('diagnostics.json')).data
const diagnostics = collection.flatMap((d) => {
  const parsed = networkDiagnosticSchema.safeParse(d)
  return parsed.success ? [parsed.data] : []
})

describe('linkQualityFromMargin', () => {
  test('follows OpenThread: above 20, 10 and 2 dB', () => {
    expect([25, 21, 20, 11, 10, 3, 2, 0].map(linkQualityFromMargin)).toEqual([
      3, 3, 2, 2, 1, 1, 0, 0,
    ])
  })
})

describe('toDeviceInfo', () => {
  test('roles, names and power from the device collection', () => {
    expect(devices.map(toDeviceInfo)).toMatchObject([
      { address: '96518e5497d5b9f3', name: 'otbr', role: 'border_router', power: 'mains' },
      { address: '2a55d952bc7b4008', name: 'eve-thermo', role: 'router', networkAddress: '0x5000' },
      {
        address: 'f2f307043724e8d0',
        name: 'f2f307043724e8d0',
        role: 'sleepy_end_device',
        power: 'battery',
        vendor: null,
        model: null,
      },
      { address: '0011223344556677', role: 'end_device' },
    ])
  })
})

describe('router eligibility', () => {
  const item = (role: string | undefined, fullThreadDevice: boolean) =>
    deviceItemSchema.parse({
      id: 'cccccccccccccccc',
      type: 'threadDevice',
      attributes: { role, mode: { rxOnWhenIdle: true, fullThreadDevice } },
    })

  test('a full Thread device that is a child is router-eligible, then a router', () => {
    expect(toDeviceInfo(item('child', true)).role).toBe('router_eligible')
    expect(toDeviceInfo(item('router', true)).role).toBe('router')
    expect(toDeviceInfo(item('leader', true)).role).toBe('router')
    expect(toDeviceInfo(item('child', false)).role).toBe('end_device')
    expect(toDeviceInfo(item(undefined, true)).role).toBe('router')
  })
})

describe('fromDiagnostics', () => {
  const { measurements, links } = fromDiagnostics(diagnostics, 1000, new Set(['96518e5497d5b9f3']))

  test('children are measured by their parent, routers by the best router that hears them', () => {
    expect(measurements.map((m) => [m.address, m.rssi, m.lqi, m.score])).toEqual([
      ['2a55d952bc7b4008', -62, 3, 76],
      ['f2f307043724e8d0', -88, 1, 24],
      ['0011223344556677', -80, 2, 40],
    ])
    expect(
      measurements.every((m) => m.protocol === 'thread' && m.raw === m.rssi && m.ts === 1000),
    ).toBe(true)
  })

  test('the children hang on their router, the router on the border router', () => {
    expect(
      links
        .filter((l) => l.parent)
        .map((l) => [l.from, l.to])
        .sort(),
    ).toEqual([
      ['0011223344556677', '2a55d952bc7b4008'],
      ['2a55d952bc7b4008', '96518e5497d5b9f3'],
      ['f2f307043724e8d0', '2a55d952bc7b4008'],
    ])
    expect(links).toHaveLength(4)
  })

  test("a router's uplink leads towards the border router, even when a farther router hears it better", () => {
    const br = 'aaaaaaaaaaaaaaaa'
    const near = 'bbbbbbbbbbbbbbbb'
    const repeater = 'cccccccccccccccc'
    const entry = (extAddress: string, averageRssi: number) => ({
      extAddress,
      linkMargin: averageRssi + 100,
      averageRssi,
    })
    const diag = (extAddress: string, routerNeighbors: ReturnType<typeof entry>[]) =>
      networkDiagnosticSchema.parse({
        id: extAddress,
        type: 'threadNetworkDiagnostic',
        attributes: { extAddress, routerNeighbors, children: [] },
      })
    const { links: chain } = fromDiagnostics(
      [
        diag(br, [entry(near, -60)]),
        // the near router hears the repeater well, the repeater is not in the border router's table
        diag(near, [entry(br, -61), entry(repeater, -55)]),
        diag(repeater, [entry(near, -56)]),
      ],
      0,
      new Set([br]),
    )
    expect(
      chain
        .filter((l) => l.parent)
        .map((l) => [l.from, l.to])
        .sort(),
    ).toEqual([
      [near, br],
      [repeater, near],
    ])
  })

  test('an invalid RSSI (127) falls back to the last RSSI, else gives no reading', () => {
    const diagnostic = (entry: Record<string, number>) =>
      networkDiagnosticSchema.parse({
        id: 'd1',
        type: 'networkDiagnostics',
        attributes: {
          extAddress: '2a55d952bc7b4008',
          children: [{ extAddress: 'f2f307043724e8d0', linkMargin: 30, ...entry }],
        },
      })
    const fallback = fromDiagnostics([diagnostic({ averageRssi: 127, lastRssi: -70 })], 0)
    expect(fallback.measurements).toMatchObject([{ rssi: -70 }])
    const none = fromDiagnostics([diagnostic({ averageRssi: 127, lastRssi: 127 })], 0)
    expect(none.measurements).toEqual([])
    expect(none.links).toMatchObject([{ rssi: null }])
  })

  test('nothing in, nothing out', () => {
    expect(fromDiagnostics([], 0)).toEqual({ measurements: [], links: [] })
  })
})

describe('fromEnergyScan', () => {
  test('the strongest sample per channel', () => {
    const scan = energyScanSchema.parse(collection.find((d) => d.type === 'energyScanReport'))
    expect(fromEnergyScan(scan)).toEqual([
      { channel: 11, energy: -45 },
      { channel: 25, energy: -91 },
    ])
  })
})

describe('fromLegacyDiagnostics', () => {
  test('devices and router links from the old /diagnostics', () => {
    const nodes = legacyDiagnosticsSchema.parse([
      {
        ExtAddress: '96518E5497D5B9F3',
        Rloc16: 0xf000,
        Route: { RouteData: [{ RouteId: 20, LinkQualityOut: 3, LinkQualityIn: 2 }] },
      },
      {
        ExtAddress: '2a55d952bc7b4008',
        Rloc16: 0x5000,
        Route: { RouteData: [{ RouteId: 60, LinkQualityOut: 2, LinkQualityIn: 3 }] },
      },
      { ExtAddress: 'f2f307043724e8d0', Rloc16: 0x5001, Mode: { RxOnWhenIdle: 0 } },
    ])
    const { devices: found, links } = fromLegacyDiagnostics(nodes)
    expect(found.map((d) => [d.address, d.role])).toEqual([
      ['96518e5497d5b9f3', 'router'],
      ['2a55d952bc7b4008', 'router'],
      ['f2f307043724e8d0', 'sleepy_end_device'],
    ])
    expect(links).toEqual([
      { from: '96518e5497d5b9f3', to: '2a55d952bc7b4008', lqi: 2, rssi: null, parent: false },
      { from: '2a55d952bc7b4008', to: '96518e5497d5b9f3', lqi: 2, rssi: null, parent: false },
      { from: 'f2f307043724e8d0', to: '2a55d952bc7b4008', lqi: null, rssi: null, parent: true },
    ])
  })
})
