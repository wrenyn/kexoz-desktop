import { useCallback, useEffect, useState } from 'react'
import { getTheme, setTheme as saveTheme } from '../lib/storage'

export type Theme = 'light' | 'dark'

function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme
  saveTheme(theme)
  void window.kexoz?.setTitleBarTheme?.(theme)
}

/** Persists light/dark and syncs the Electron title bar. */
export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(() => getTheme())

  useEffect(() => {
    applyTheme(theme)
  }, [theme])

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next)
  }, [])

  const toggleTheme = useCallback(() => {
    setThemeState(current => current === 'dark' ? 'light' : 'dark')
  }, [])

  return { theme, setTheme, toggleTheme }
}
