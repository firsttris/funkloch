// The time zone every date on the pages is shown in: the server's (TZ), which also sets the day
// boundaries, the heatmap hours and the night jobs. The root sets it from the app info before
// anything renders, so the server and the browser write the same dates and hydration matches.
let zone: string | undefined

export const setTimeZone = (value: string) => {
  zone = value
}

/** undefined until set: Intl then uses the runtime's own zone */
export const timeZone = () => zone
