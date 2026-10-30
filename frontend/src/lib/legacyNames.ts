const STORAGE_KEY = 'kexoz-tunnel-names'

/** Names older versions kept on this computer only, keyed by share id. */
export function loadLegacyNames(): Record<string, string> {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) as Record<string, string> : {}
  } catch { return {} }
}

export function forgetLegacyNames(ids: string[]) {
  const names = loadLegacyNames()
  for (const id of ids) delete names[id]
  if (Object.keys(names).length === 0) window.localStorage.removeItem(STORAGE_KEY)
  else window.localStorage.setItem(STORAGE_KEY, JSON.stringify(names))
}
