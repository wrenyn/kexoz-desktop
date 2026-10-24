export const CLIENT_ID_KEY = 'kexoz-client-id'
export const THEME_KEY = 'kexoz-theme'
export const QUICK_PORTS = [3000, 4000, 5173, 8080, 8000]

export const getClientId = (): string | null => window.localStorage.getItem(CLIENT_ID_KEY)
export const setClientId = (id: string): void => window.localStorage.setItem(CLIENT_ID_KEY, id)
export const clearClientId = (): void => window.localStorage.removeItem(CLIENT_ID_KEY)
export const getTheme = (): 'light' | 'dark' => {
  const saved = window.localStorage.getItem(THEME_KEY)
  return saved === 'light' ? 'light' : 'dark'
}
export const setTheme = (theme: 'light' | 'dark'): void => window.localStorage.setItem(THEME_KEY, theme)
