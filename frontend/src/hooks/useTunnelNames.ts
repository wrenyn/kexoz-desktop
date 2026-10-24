import { useCallback, useState } from 'react'

const STORAGE_KEY = 'kexoz-tunnel-names'

function loadNames(): Record<string, string> {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) as Record<string, string> : {}
  } catch { return {} }
}

function saveNames(names: Record<string, string>) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(names))
}

export function useTunnelNames() {
  const [names, setNames] = useState<Record<string, string>>(loadNames)

  const setName = useCallback((tunnelId: string, name: string) => {
    setNames(prev => {
      const next = { ...prev, [tunnelId]: name.trim() }
      if (!name.trim()) delete next[tunnelId]
      saveNames(next)
      return next
    })
  }, [])

  const getName = useCallback((tunnelId: string) => names[tunnelId] ?? '', [names])

  return { names, setName, getName }
}
