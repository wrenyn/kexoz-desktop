/** Local persistence for Android Preview device binding (serial stays on this machine). */

const serialKey = (tunnelId: string) => `kexoz-mobile-serial:${tunnelId}`
const sessionKey = (tunnelId: string) => `kexoz-mobile-session:${tunnelId}`
const metaKey = (tunnelId: string) => `kexoz-mobile-meta:${tunnelId}`

export type MobileDeviceMeta = {
  serial: string
  model?: string
  androidVersion?: string
  width?: number
  height?: number
  emulator?: boolean
}

export function saveMobileBinding(tunnelId: string, sessionId: string, meta: MobileDeviceMeta) {
  try {
    localStorage.setItem(serialKey(tunnelId), meta.serial)
    localStorage.setItem(metaKey(tunnelId), JSON.stringify(meta))
    sessionStorage.setItem(sessionKey(tunnelId), sessionId)
  } catch { /* ignore */ }
}

export function readMobileSerial(tunnelId: string): string {
  try {
    return localStorage.getItem(serialKey(tunnelId)) || ''
  } catch {
    return ''
  }
}

export function readMobileMeta(tunnelId: string): MobileDeviceMeta | null {
  try {
    const raw = localStorage.getItem(metaKey(tunnelId))
    if (!raw) {
      const serial = readMobileSerial(tunnelId)
      return serial ? { serial } : null
    }
    return JSON.parse(raw) as MobileDeviceMeta
  } catch {
    return null
  }
}

export function readMobileSessionId(tunnelId: string): string {
  try {
    return sessionStorage.getItem(sessionKey(tunnelId)) || ''
  } catch {
    return ''
  }
}

export function clearMobileSession(tunnelId: string) {
  try {
    sessionStorage.removeItem(sessionKey(tunnelId))
  } catch { /* ignore */ }
}

export function clearMobileBinding(tunnelId: string) {
  try {
    localStorage.removeItem(serialKey(tunnelId))
    localStorage.removeItem(metaKey(tunnelId))
    sessionStorage.removeItem(sessionKey(tunnelId))
  } catch { /* ignore */ }
}
