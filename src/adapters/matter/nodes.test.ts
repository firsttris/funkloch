import { describe, expect, test } from 'vitest'
import { specNetwork } from './fake'
import { batteryOf, deviceInfoOf, isSleepy, networkOf, pollPaths, toNode } from './nodes'
import { nodeSchema } from './schemas'

const nodes = () => specNetwork().nodes.map((n) => toNode(nodeSchema.parse(n)))
const node = (id: number) => {
  const found = nodes().find((n) => n.id === String(id))
  if (!found) throw new Error(`no node ${id}`)
  return found
}

describe('networkOf', () => {
  test('from the NetworkCommissioning feature map', () => {
    expect(nodes().map(networkOf)).toEqual(['thread', 'thread', 'thread', 'wifi', 'other'])
  })
})

describe('deviceInfoOf', () => {
  test('a Thread router by its node label, with the OTBR’s address format', () => {
    expect(deviceInfoOf(node(1))).toEqual({
      protocol: 'thread',
      address: '1111111111111111',
      name: 'Kaffeemaschine',
      role: 'router',
      model: 'Eve Energy',
      vendor: 'Eve Systems',
      power: 'mains',
      networkAddress: '0x0400',
    })
  })

  test('without a node label the product name; a sleepy one runs on battery', () => {
    expect(deviceInfoOf(node(2))).toMatchObject({ name: 'NL67', power: 'unknown' })
    expect(deviceInfoOf(node(3))).toMatchObject({
      name: 'Eve Door',
      role: 'sleepy_end_device',
      power: 'battery',
    })
  })

  test('a Wi-Fi station by its MAC address; an Ethernet bridge is left out', () => {
    expect(deviceInfoOf(node(4))).toMatchObject({
      protocol: 'wifi',
      address: 'aa:bb:cc:00:11:22',
      name: 'Waschmaschine',
      role: 'end_device',
      networkAddress: null,
    })
    expect(deviceInfoOf(node(5))).toBeNull()
  })
})

describe('battery and polling', () => {
  test('the battery level counts half percent', () => {
    expect(batteryOf(node(3))).toBe(85)
    expect(batteryOf(node(1))).toBeNull()
  })

  test('only awake devices are read, Thread with their counters where they have them', () => {
    expect(pollPaths(node(1))).toEqual(['0/53/7', '0/53/23', '0/53/24', '0/53/36'])
    expect(pollPaths(node(2))).toEqual(['0/53/7'])
    expect(isSleepy(node(3))).toBe(true)
    expect(pollPaths(node(3))).toEqual([])
    expect(pollPaths(node(4))).toEqual(['0/54/0', '0/54/4'])
    expect(pollPaths({ ...node(1), available: false })).toEqual([])
    expect(pollPaths(node(5))).toEqual([])
  })
})
