import { createServerFn } from '@tanstack/react-start'
import { version } from '../../../package.json'
import { getRuntime } from '../runtime'

/** What every page needs to know about this install */
export const getAppInfo = createServerFn({ method: 'GET' }).handler(() => {
  const { config } = getRuntime()
  return {
    version,
    demo: config.FUNKLOCH_DEMO,
    auth: !config.FUNKLOCH_DEMO,
    /** The server's time zone (TZ); the pages show every date in it */
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  }
})
