// The demo network the E2E tests run against, counted from its definition so a new demo device
// does not mean changing every count.
import { DEMO_DEVICES } from '../../src/demo/devices'

export const DEVICES = DEMO_DEVICES.length
export const THREAD_DEVICES = DEMO_DEVICES.filter((d) => d.protocol === 'thread').length
