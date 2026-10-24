import { useState, useCallback, useEffect } from 'react'
import { setTheme as saveTheme } from '../lib/storage'

function readInitialTheme(): 'light' | 'dark' {
  // 1. Check localStorage first
  const saved = localStorage.getItem('kexoz-theme')
  if (saved === 'light' || saved === 'dark') return saved
  // 2. Fall back to OS preference
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export function useTheme() {
  const [theme, setThemeState] = useState<'light' | 'dark'>(readInitialTheme)

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    void window.kexoz?.setTitleBarTheme?.(theme)
  }, [theme])

  // Listen for OS preference changes (only when no manual pref is saved)
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const listener = (e: MediaQueryListEvent) => {
      const saved = localStorage.getItem('kexoz-theme')
      if (!saved) {
        setThemeState(e.matches ? 'dark' : 'light')
      }
    }
    mq.addEventListener('change', listener)
    return () => mq.removeEventListener('change', listener)
  }, [])

  const toggleTheme = useCallback(() => {
    setThemeState(prev => {
      const next = prev === 'dark' ? 'light' : 'dark'
      saveTheme(next)
      return next
    })
  }, [])

  return { theme, toggleTheme }
}
