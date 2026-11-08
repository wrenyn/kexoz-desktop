import { useEffect } from 'react'
import { setTheme as saveTheme } from '../lib/storage'

/** Dark-only for now — theme switching is disabled. */
export function useTheme() {
  useEffect(() => {
    document.documentElement.dataset.theme = 'dark'
    saveTheme('dark')
    void window.kexoz?.setTitleBarTheme?.('dark')
  }, [])

  return { theme: 'dark' as const }
}
