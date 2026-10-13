import { describe, expect, test } from 'vitest'
import { zigbeeScore } from './meta'
import { nameMap, parseMessage, toDeviceInfo, toLinks } from './parse'
import type { BridgeDevice } from './schemas'

const coordinator: BridgeDevice = {
  ieee_address: '0x00124B0012345678',
  type: 'Coordinator',
  network_address: 0,
  friendly_name: 'Coordinator',
  definition: null,
}
const lamp: BridgeDevice = {
  ieee_address: '0x00158d0001a2b3c4',
  type: 'Router',
  network_address: 0x5a3c,
  friendly_name: 'Küche/Lampe',
  definition: { model: 'LED1836G9', vendor: 'IKEA', description: 'bulb' },
  power_source: 'Mains (single phase)',
}
const sensor: BridgeDevice = {
  ieee_address: '0x00158d0009876543',
  type: 'EndDevice',
  network_address: 0x1234,
  friendly_name: 'Temperatursensor Keller',
  definition: null,
  model_id: 'lumi.weather',
  manufacturer: 'LUMI',
  power_source: 'Battery',
}

const ctx = {
  baseTopic: 'zigbee2mqtt',
  byName: nameMap([coordinator, lamp, sensor]),
  now: 1000,
  heard: new Set<string>(),
}

describe('toDeviceInfo', () => {
  test('maps type, power and model', () => {
    expect(toDeviceInfo(lamp)).toEqual({
      protocol: 'zigbee',
      address: '0x00158d0001a2b3c4',
      name: 'Küche/Lampe',
      role: 'router',
      model: 'LED1836G9',
      vendor: 'IKEA',
      power: 'mains',
      networkAddress: '0x5A3C',
    })
    expect(toDeviceInfo(sensor)).toMatchObject({
      role: 'end_device',
      power: 'battery',
      model: 'lumi.weather',
      vendor: 'LUMI',
    })
    expect(toDeviceInfo(coordinator)).toMatchObject({
      address: '0x00124b0012345678',
      role: 'coordinator',
      power: 'mains',
    })
  })
})

describe('parseMessage', () => {
  test('bridge/devices gives the device list and the names', () => {
    const result = parseMessage(ctx, 'zigbee2mqtt/bridge/devices', JSON.stringify([lamp]), true)
    expect(result.devices).toHaveLength(1)
    expect(result.observations).toEqual([
      {
        kind: 'devices',
        protocol: 'zigbee',
        ts: 1000,
        devices: [toDeviceInfo(lamp)],
        complete: true,
      },
    ])
  })

  test('a device message with linkquality is a measurement, names may contain slashes', () => {
    const result = parseMessage(
      ctx,
      'zigbee2mqtt/Küche/Lampe',
      '{"state":"ON","linkquality":189}',
      false,
    )
    expect(result.observations).toEqual([
      {
        kind: 'measurement',
        measurement: {
          protocol: 'zigbee',
          address: '0x00158d0001a2b3c4',
          ts: 1000,
          score: 74,
          raw: 189,
          lqi: 189,
          rssi: null,
          battery: null,
          source: 'message',
        },
      },
    ])
  })

  test('a message without linkquality still counts as seen', () => {
    const result = parseMessage(ctx, 'zigbee2mqtt/Temperatursensor Keller', '{"battery":64}', false)
    expect(result.observations).toEqual([
      { kind: 'seen', protocol: 'zigbee', address: '0x00158d0009876543', ts: 1000, battery: 64 },
    ])
  })

  test('a retained device state is ignored', () => {
    const result = parseMessage(ctx, 'zigbee2mqtt/Küche/Lampe', '{"linkquality":189}', true)
    expect(result.observations).toEqual([])
  })

  test('availability in the JSON and the legacy form', () => {
    const json = parseMessage(
      ctx,
      'zigbee2mqtt/Küche/Lampe/availability',
      '{"state":"offline"}',
      true,
    )
    expect(json.observations).toEqual([
      {
        kind: 'availability',
        report: { protocol: 'zigbee', address: '0x00158d0001a2b3c4', ts: 1000, online: false },
      },
    ])
    const legacy = parseMessage(ctx, 'zigbee2mqtt/Küche/Lampe/availability', 'online', true)
    expect(legacy.observations[0]).toMatchObject({ report: { online: true } })
  })

  test('an empty payload clears a retained topic and is ignored, without a schema warning', () => {
    expect(parseMessage(ctx, 'zigbee2mqtt/bridge/devices', '', true)).toEqual({ observations: [] })
  })

  test('an empty availability payload clears the topic and is ignored', () => {
    expect(
      parseMessage(ctx, 'zigbee2mqtt/Küche/Lampe/availability', '', true).observations,
    ).toEqual([])
  })

  test('bridge/info gives the channel', () => {
    const info = JSON.stringify({ version: '2.14.2', network: { channel: 15, pan_id: 6754 } })
    expect(parseMessage(ctx, 'zigbee2mqtt/bridge/info', info, true).observations).toEqual([
      { kind: 'channel', protocol: 'zigbee', channel: 15 },
    ])
  })

  test('bridge state', () => {
    expect(parseMessage(ctx, 'zigbee2mqtt/bridge/state', '{"state":"online"}', true)).toEqual({
      observations: [{ kind: 'bridge', protocol: 'zigbee', ts: 1000, online: true }],
    })
  })

  test('unknown names, groups, set topics and other bases are ignored', () => {
    expect(
      parseMessage(ctx, 'zigbee2mqtt/Wohnzimmer', '{"state":"ON"}', false).observations,
    ).toEqual([])
    expect(
      parseMessage(ctx, 'zigbee2mqtt/Küche/Lampe/set', '{"state":"ON"}', false).observations,
    ).toEqual([])
    expect(parseMessage(ctx, 'other/Küche/Lampe', '{"linkquality":1}', false).observations).toEqual(
      [],
    )
    expect(parseMessage(ctx, 'zigbee2mqtt/bridge/logging', '{}', false).observations).toEqual([])
  })

  test('a payload that breaks the schema is reported, not thrown', () => {
    const result = parseMessage(ctx, 'zigbee2mqtt/Küche/Lampe', '{"linkquality":"high"}', false)
    expect(result.observations).toEqual([])
    expect(result.invalid).toContain('0x00158d0001a2b3c4')
  })
})

describe('network map', () => {
  const response = (links: unknown[]) =>
    JSON.stringify({
      status: 'ok',
      data: { type: 'raw', routes: false, value: { nodes: [], links } },
    })
  const link = (source: string, target: string, relationship: number, lqi: number) => ({
    source: { ieeeAddr: source, networkAddress: 1 },
    target: { ieeeAddr: target, networkAddress: 2 },
    relationship,
    lqi,
    depth: 1,
  })

  test('relationship 1 makes the target the parent, 0 the source', () => {
    const map = {
      nodes: [],
      links: [
        link('0xA', '0xB', 1, 41),
        link('0xC', '0xD', 0, 99),
        link('0xE', '0xF', 2, 120),
        link('0xG', '0xH', 4, 10),
      ],
    }
    expect(toLinks(map)).toEqual([
      { from: '0xa', to: '0xb', lqi: 41, rssi: null, parent: true },
      { from: '0xd', to: '0xc', lqi: 99, rssi: null, parent: true },
      { from: '0xe', to: '0xf', lqi: 120, rssi: null, parent: false },
    ])
  })

  test('the response becomes a topology', () => {
    const result = parseMessage(
      ctx,
      'zigbee2mqtt/bridge/response/networkmap',
      response([link('0xA', '0xB', 1, 41)]),
      false,
    )
    expect(result.observations).toEqual([
      {
        kind: 'topology',
        topology: {
          protocol: 'zigbee',
          ts: 1000,
          links: [{ from: '0xa', to: '0xb', lqi: 41, rssi: null, parent: true }],
        },
      },
    ])
  })

  test('routers get an uplink to the coordinator; a silent router a reading from it', () => {
    const node = (ieeeAddr: string, type: string) => ({
      ieeeAddr,
      friendlyName: ieeeAddr,
      type,
      networkAddress: 1,
    })
    const text = JSON.stringify({
      status: 'ok',
      data: {
        type: 'raw',
        routes: false,
        value: {
          nodes: [node('0xC', 'Coordinator'), node('0xR', 'Router'), node('0xP', 'Router')],
          // the coordinator's table: both routers as siblings
          links: [
            link('0xR', '0xC', 2, 170),
            link('0xP', '0xC', 2, 230),
            link('0xE', '0xR', 1, 60),
          ],
        },
      },
    })
    const result = parseMessage(
      { ...ctx, heard: new Set(['0xp']) },
      'zigbee2mqtt/bridge/response/networkmap',
      text,
      false,
    )
    const [topology, ...readings] = result.observations
    expect(topology?.kind === 'topology' && topology.topology.links).toEqual([
      { from: '0xr', to: '0xc', lqi: 170, rssi: null, parent: true },
      { from: '0xp', to: '0xc', lqi: 230, rssi: null, parent: true },
      { from: '0xe', to: '0xr', lqi: 60, rssi: null, parent: true },
    ])
    // 0xp sends its own linkquality, 0xr is a repeater without entities
    expect(readings).toEqual([
      {
        kind: 'measurement',
        measurement: {
          protocol: 'zigbee',
          address: '0xr',
          ts: 1000,
          score: zigbeeScore(170),
          raw: 170,
          lqi: 170,
          rssi: null,
          battery: null,
          source: 'networkmap',
        },
      },
    ])
  })

  test('an error response gives nothing', () => {
    const text = JSON.stringify({ status: 'error', error: 'timeout', data: {} })
    expect(
      parseMessage(ctx, 'zigbee2mqtt/bridge/response/networkmap', text, false).observations,
    ).toEqual([])
  })
})
