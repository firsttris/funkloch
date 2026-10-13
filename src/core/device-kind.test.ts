import { describe, expect, test } from 'vitest'
import { deviceKind } from './device-kind'

describe('deviceKind', () => {
  test('reads German and English names', () => {
    expect(deviceKind('Rauchmelder - Keller Waschküche', 'end_device')).toBe('smoke')
    expect(deviceKind('Steckdose - Keller Sauna', 'router')).toBe('plug')
    expect(deviceKind('Wandtaster - EG Treppe', 'end_device')).toBe('switch')
    expect(deviceKind('Bewegungsmelder Garage', 'sleepy_end_device')).toBe('motion')
    expect(deviceKind('Front door', 'sleepy_end_device')).toBe('contact')
    expect(deviceKind('Thermostat Büro', 'router')).toBe('climate')
    expect(deviceKind('Lampe Küche', 'router')).toBe('light')
    expect(deviceKind('Rollladen Schlafzimmer', 'router')).toBe('blind')
    expect(deviceKind('Pflanzen Feuchtigkeitssensor', 'end_device')).toBe('water')
  })

  test('a switch for a light is a switch, a plug for a light a plug', () => {
    expect(deviceKind('Wandtaster - Garage Licht', 'end_device')).toBe('switch')
    expect(deviceKind('Steckdose - Garage Licht', 'router')).toBe('plug')
  })

  test('the model helps when the name does not', () => {
    expect(deviceKind('0x00158d0001', 'end_device', 'Aqara water leak sensor')).toBe('water')
  })

  test('falls back to the role', () => {
    expect(deviceKind('Koordinator', 'coordinator')).toBe('root')
    expect(deviceKind('Border Router', 'border_router')).toBe('root')
    expect(deviceKind('ESP32-C6', 'router')).toBe('router')
    expect(deviceKind('0x00158d0001', 'end_device')).toBe('device')
  })
})
