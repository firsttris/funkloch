// Light or dark: the viewer's choice in this browser, or the system's. The choice sets
// data-theme on <html>, which picks the colour tokens in styles.css. The inline script runs in the
// <head> before the page paints, so a dark page never flashes light.
import { useEffect, useState } from 'react'

export const THEMES = ['system', 'light', 'dark'] as const
export type Theme = (typeof THEMES)[number]

const KEY = 'funkloch-theme'

export const isTheme = (value: unknown): value is Theme =>
  typeof value === 'string' && (THEMES as readonly string[]).includes(value)

/** The colours a choice gives, with the system's preference for "system" */
export const resolveTheme = (choice: Theme, systemDark: boolean): 'light' | 'dark' =>
  choice === 'system' ? (systemDark ? 'dark' : 'light') : choice

/** The next choice of the header's button */
export const nextTheme = (choice: Theme): Theme =>
  THEMES[(THEMES.indexOf(choice) + 1) % THEMES.length] ?? 'system'

/** For the <head>: applies the stored choice, and follows the system while it is "system" */
export const themeScript = `(function(){var m=matchMedia('(prefers-color-scheme: dark)');function a(){var c;try{c=localStorage.getItem('${KEY}')}catch(e){}var d=c==='dark'||(c!=='light'&&m.matches);document.documentElement.dataset.theme=d?'dark':'light'}a();m.addEventListener('change',a)})()`

const stored = (): Theme => {
  try {
    const value = localStorage.getItem(KEY)
    return isTheme(value) ? value : 'system'
  } catch {
    return 'system'
  }
}

const apply = (choice: Theme) => {
  document.documentElement.dataset.theme = resolveTheme(
    choice,
    matchMedia('(prefers-color-scheme: dark)').matches,
  )
}

/** The viewer's choice and a setter that stores and applies it; "system" until the page runs */
export const useTheme = () => {
  const [theme, setTheme] = useState<Theme>('system')
  useEffect(() => setTheme(stored()), [])
  const choose = (choice: Theme) => {
    try {
      if (choice === 'system') localStorage.removeItem(KEY)
      else localStorage.setItem(KEY, choice)
    } catch {
      // Without storage the choice holds for this page only
    }
    setTheme(choice)
    apply(choice)
  }
  return [theme, choose] as const
}
