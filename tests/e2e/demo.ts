// The demo network the E2E tests run against, counted from its definition so a new demo device
// does not mean changing every count.
import { DEMO_DEVICES } from '../../src/demo/devices'

export const DEVICES = DEMO_DEVICES.length
export const THREAD_DEVICES = DEMO_DEVICES.filter((d) => d.protocol === 'thread').length

/**
 * The moment the screenshots show (FUNKLOCH_DEMO_NOW): the demo stands still there, so a picture
 * changes only with the look. A morning, before the terrace socket's weak evening.
 */
export const SCREENSHOT_NOW = '2026-10-13T06:30:00Z'
