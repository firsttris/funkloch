// The devices of the mockup, with the stories it tells: a sensor in the cellar that slowly gets
// worse and changes its parent, a socket on the terrace that drops every evening, a door sensor
// in the garage that went silent six hours ago, a Thread router built from an ESP32-C6 that fails
// to send one frame in ten. The cellar: a socket that carries three sensors over a weak link to the
// coordinator, and an ESP32-C6 Zigbee router next to it that no device uses.
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
  /** Share of frames that fail to go out (Thread routers' MAC counters) */
  txErrors?: number
  /** The link to the parent as scores instead of the device's own level: [parent hears it, it hears the parent] */
  uplink?: [number, number]
  /** Neighbor links as scores: how `to` hears this device (`there`) and how it hears `to` (`back`) */
  links?: { to: string; there: number; back: number }[]
}

export const ZIGBEE_COORDINATOR = '0x00124b0024c1a2f0'
export const THREAD_BORDER_ROUTER = '9e3a6f1c2b7d4e05'

const zigbee = (address: string) => `0x${address}`

const CELLAR_SOCKET = zigbee('00158d0005a1b20a')
const LAUNDRY_SOCKET = zigbee('00158d0005a1b209')
const OFFICE_THERMOSTAT = '6c0d2e9f41a7b852'
const TV_LIGHTSTRIP = 'a5f2d81c07e3b649'

/** A sensor in the cellar that hangs on the cellar socket */
const cellarSensor = (
  address: string,
  name: string,
  model: string,
  interval: number,
  score: number,
): DemoDevice => ({
  protocol: 'zigbee',
  address: zigbee(address),
  name,
  role: 'end_device',
  power: 'battery',
  model,
  vendor: 'Aqara',
  interval,
  level: [
    [720, score],
    [0, score],
  ],
  noise: 4,
  parents: [[720, CELLAR_SOCKET]],
})

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
    noise: 4,
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
    protocol: 'zigbee',
    address: CELLAR_SOCKET,
    name: 'Steckdose Keller Flur',
    role: 'router',
    power: 'mains',
    model: 'E1603',
    vendor: 'IKEA',
    interval: 4,
    level: [
      [720, 32],
      [0, 31],
    ],
    noise: 3,
    parents: [[720, ZIGBEE_COORDINATOR]],
    // LQI 56 and 36: the only way out of the cellar for the sensors behind it
    uplink: [14, 22],
    links: [{ to: LAUNDRY_SOCKET, there: 60, back: 58 }],
  },
  cellarSensor('00158d0005a1b20c', 'Wassermelder Keller', 'SJCGQ11LM', 30, 38),
  cellarSensor('00158d0005a1b20d', 'Bewegungsmelder Keller', 'RTCGQ11LM', 20, 42),
  cellarSensor('00158d0005a1b20e', 'Temperatursensor Vorratsraum', 'WSDCGQ11LM', 20, 36),
  {
    protocol: 'zigbee',
    address: zigbee('00158d0005a1b20b'),
    name: 'ESP32-C6 Zigbee Router',
    role: 'router',
    power: 'mains',
    model: 'ESP32-C6 Zigbee Router',
    vendor: 'Espressif',
    interval: 10,
    level: [
      [720, 28],
      [0, 28],
    ],
    noise: 2,
    parents: [[720, ZIGBEE_COORDINATOR]],
    // LQI 64 and 15 to the coordinator upstairs, strong to the sockets that cover the cellar
    uplink: [6, 25],
    links: [
      { to: CELLAR_SOCKET, there: 59, back: 55 },
      { to: LAUNDRY_SOCKET, there: 47, back: 45 },
    ],
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
      [72, 52],
      [0, 27],
    ],
    noise: 5,
    eveningDip: 33,
    parents: [[720, OFFICE_THERMOSTAT]],
    txErrors: 0.006,
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
    parents: [[720, TV_LIGHTSTRIP]],
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
    parents: [[720, OFFICE_THERMOSTAT]],
  },
  {
    protocol: 'thread',
    address: OFFICE_THERMOSTAT,
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
    txErrors: 0.0008,
  },
  {
    protocol: 'thread',
    address: TV_LIGHTSTRIP,
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
    txErrors: 0.0005,
  },
  {
    protocol: 'thread',
    address: '52bbac72ec804b82',
    // No SRP host name: named from its diagnostic as the Thread adapter does (threadName)
    name: 'ESP32-C6 Thread Router · 52bb…4b82',
    role: 'router',
    power: 'mains',
    model: 'ESP32-C6 Thread Router',
    vendor: 'Espressif',
    interval: 5,
    level: [
      [720, 52],
      [0, 50],
    ],
    noise: 4,
    parents: [[720, THREAD_BORDER_ROUTER]],
    txErrors: 0.097,
    uplink: [50, 48],
    // its neighbors hear it at −93 and −98 dBm
    links: [
      { to: OFFICE_THERMOSTAT, there: 14, back: 20 },
      { to: TV_LIGHTSTRIP, there: 4, back: 10 },
    ],
  },
]
