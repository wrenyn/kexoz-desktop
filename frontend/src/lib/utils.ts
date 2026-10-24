import axios from 'axios'

export const parsePort = (value: unknown): number | null => {
  const p = Number(value)
  return Number.isInteger(p) && p >= 1 && p <= 65535 ? p : null
}

export const normalizeSubdomain = (v: string) =>
  v.trim().toLowerCase().replace(/[^a-z0-9-]/g, '').replace(/^-+/, '').replace(/-+$/, '')

export const extractError = (err: unknown): string => {
  if (axios.isAxiosError(err)) {
    const msg = err.response?.data?.message
    if (typeof msg === 'string' && msg.trim()) return msg
  }
  if (err instanceof Error && err.message.trim()) return err.message
  return 'Something went wrong while contacting the server.'
}

export const toBase64 = (bytes: Uint8Array): string => {
  let s = ''
  bytes.forEach(b => { s += String.fromCharCode(b) })
  return btoa(s)
}

export const fromBase64 = (v: string): Uint8Array => {
  const bin = atob(v)
  return Uint8Array.from(bin, c => c.charCodeAt(0))
}

export const formatTime = (iso: string) => {
  const d = new Date(iso)
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}:${d.getSeconds().toString().padStart(2, '0')}`
}

export const statusClass = (s: number | null) => {
  if (!s) return ''
  if (s < 300) return 'ok'
  if (s < 500) return 'warn'
  return 'err'
}
