import { describe, expect, test } from 'vitest'
import { isTheme, nextTheme, resolveTheme } from './theme'

describe('theme', () => {
  test('"system" follows the system, a choice of its own wins', () => {
    expect(resolveTheme('system', true)).toBe('dark')
    expect(resolveTheme('system', false)).toBe('light')
    expect(resolveTheme('light', true)).toBe('light')
    expect(resolveTheme('dark', false)).toBe('dark')
  })

  test('the button goes system → light → dark → system', () => {
    expect(nextTheme('system')).toBe('light')
    expect(nextTheme('light')).toBe('dark')
    expect(nextTheme('dark')).toBe('system')
  })

  test('only the three choices are read back from storage', () => {
    expect(isTheme('dark')).toBe(true)
    expect(isTheme('blue')).toBe(false)
    expect(isTheme(null)).toBe(false)
  })
})
