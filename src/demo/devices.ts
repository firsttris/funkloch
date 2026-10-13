// The devices of the mockup, with the stories it tells: a sensor in the cellar that slowly gets
// worse and changes its parent, a socket on the terrace that drops every evening, a door sensor
// in the garage that went silent six hours ago.
import type { PowerSource, Role } from '~/core/types'

export type DemoDevice = {
  protocol: 'zigbee' | 'thread'
  address: string
  name: string
  role: Role
  power: PowerSource
  model: string
  vendor: string
  /** Minutes between two messages */
  interval: number
  /** Score level over time: [hours before now, score] points, linear in between */
  level: [number, number][]
  noise: number
  /** Score drop between 19 and 23 h local time */
  eveningDip?: number
  /** Stretches without messages: [hours before now (start), hours before now (end)] */
  offline?: [number, number][]
  /** Parent over time: [hours before now since when, parent address] */
  parents: [number, string][]
}

export const ZIGBEE_COORDINATOR = '0x00124b0024c1a2f0'
export const THREAD_BORDER_ROUTER = '9e3a6f1c2b7d4e05'

const zigbee = (address: string) => `0x${address}`

export const DEMO_DEVICES: DemoDevice[] = [
  {
    protocol: 'zigbee',
    address: zigbee('00158d0005a1b201'),
    name: 'Türsensor Garage',
    role: 'end_device',
    power: 'battery',
    model: 'MCCGQ11LM',
    vendor: 'Aqara',
    interval: 50,
    level: [
      [720, 32],
      [0, 24],
    ],
    noise: 6,
    offline: [[6, 0]],
    parents: [[720, zigbee('00158d0005a1b204')]],
  },
  {
    protocol: 'zigbee',
    address: zigbee('00158d0001a2b3c4'),
    name: 'Temperatursensor Keller',
    role: 'end_device',
    power: 'battery',
    model: 'WSDCGQ11LM',
    vendor: 'Aqara',
    interval: 20,
    level: [
      [720, 47],
      [100, 46],
      [96, 40],
      [0, 14],
    ],
    noise: 5,
    offline: [[55, 49]],
    parents: [
      [720, zigbee('00158d0005a1b207')],
      [86, zigbee('00158d0005a1b204')],
      [49, zigbee('00158d0005a1b209')],
    ],
  },
  {
    protocol: 'zigbee',
    address: zigbee('00158d0005a1b203'),
    name: 'Taster Bad',
    role: 'end_device',
    power: 'battery',
    model: 'WXKG11LM',
    vendor: 'Aqara',
    interval: 45,
    level: [
      [720, 32],
      [0, 30],
    ],
    noise: 8,
    parents: [[720, zigbee('00158d0005a1b206')]],
  },
  {
    protocol: 'zigbee',
    address: zigbee('00158d0005a1b204'),
    name: 'Rollladen Schlafzimmer',
    role: 'router',
    power: 'mains',
    model: 'E1757',
    vendor: 'IKEA',
    interval: 4,
    level: [
      [720, 48],
      [0, 46],
    ],
    noise: 6,
    parents: [[720, ZIGBEE_COORDINATOR]],
  },
  {
    protocol: 'zigbee',
    address: zigbee('00158d0005a1b205'),
    name: 'Bewegungsmelder Flur',
    role: 'end_device',
    power: 'battery',
    model: 'RTCGQ11LM',
    vendor: 'Aqara',
    interval: 15,
    level: [
      [720, 63],
      [0, 62],
    ],
    noise: 6,
    parents: [[720, zigbee('00158d0005a1b207')]],
  },
  {
    protocol: 'zigbee',
    address: zigbee('00158d0005a1b206'),
    name: 'Lampe Küche',
    role: 'router',
    power: 'mains',
    model: 'LED1836G9',
    vendor: 'IKEA',
    interval: 3,
    level: [
      [720, 66],
      [168, 66],
      [0, 74],
    ],
    noise: 4,
    parents: [[720, ZIGBEE_COORDINATOR]],
  },
  {
    protocol: 'zigbee',
    address: zigbee('00158d0005a1b207'),
    name: 'Steckdose Wohnzimmer',
    role: 'router',
    power: 'mains',
    model: 'E1603',
    vendor: 'IKEA',
    interval: 3,
    level: [
      [720, 84],
      [0, 83],
    ],
    noise: 3,
    parents: [[720, ZIGBEE_COORDINATOR]],
  },
  {
    protocol: 'zigbee',
    address: zigbee('00158d0005a1b209'),
    name: 'Steckdose Waschküche',
    role: 'router',
    power: 'mains',
    model: 'E1603',
    vendor: 'IKEA',
    interval: 4,
    level: [
      [720, 70],
      [0, 69],
    ],
    noise: 4,
    parents: [[720, ZIGBEE_COORDINATOR]],
  },
  {
    protocol: 'thread',
    address: '2f81c4d09a7be311',
    name: 'Steckdose Terrasse',
    role: 'router',
    power: 'mains',
    model: 'Eve Energy Outdoor',
    vendor: 'Eve',
    interval: 2,
    level: [
      [720, 52],
      [96, 52],
      [0, 27],
    ],
    noise: 5,
    eveningDip: 28,
    parents: [[720, '6c0d2e9f41a7b852']],
  },
  {
    protocol: 'thread',
    address: '4b17e2a8c3d90f62',
    name: 'Fensterkontakt Bad',
    role: 'sleepy_end_device',
    power: 'battery',
    model: 'Eve Door & Window',
    vendor: 'Eve',
    interval: 14,
    level: [
      [720, 50],
      [0, 48],
    ],
    noise: 6,
    parents: [[720, 'a5f2d81c07e3b649']],
  },
  {
    protocol: 'thread',
    address: '7d93b0e5f1a2c844',
    name: 'Luftsensor Gästezimmer',
    role: 'sleepy_end_device',
    power: 'battery',
    model: 'Eve Room',
    vendor: 'Eve',
    interval: 5,
    level: [
      [720, 42],
      [80, 40],
      [0, 58],
    ],
    noise: 4,
    parents: [[720, '6c0d2e9f41a7b852']],
  },
  {
    protocol: 'thread',
    address: '6c0d2e9f41a7b852',
    name: 'Thermostat Büro',
    role: 'router',
    power: 'mains',
    model: 'Eve Thermo',
    vendor: 'Eve',
    interval: 2,
    level: [
      [720, 83],
      [0, 82],
    ],
    noise: 3,
    parents: [[720, THREAD_BORDER_ROUTER]],
  },
  {
    protocol: 'thread',
    address: 'a5f2d81c07e3b649',
    name: 'Lichtleiste TV',
    role: 'router',
    power: 'mains',
    model: 'Nanoleaf Essentials Lightstrip',
    vendor: 'Nanoleaf',
    interval: 2,
    level: [
      [720, 88],
      [0, 88],
    ],
    noise: 2,
    parents: [[720, THREAD_BORDER_ROUTER]],
  },
]
