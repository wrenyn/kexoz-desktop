import { useCallback, useState } from 'react'
import type { FolderShareConfig } from '../lib/shares'

const STORAGE_KEY = 'kexoz-folder-shares'

function loadFolders(): Record<string, FolderShareConfig> {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) as Record<string, FolderShareConfig> : {}
  } catch { return {} }
}

function saveFolders(folders: Record<string, FolderShareConfig>) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(folders))
}

/** Maps folder share ids to the local folder they serve on this device. */
export function useFolderShares() {
  const [folders, setFolders] = useState<Record<string, FolderShareConfig>>(loadFolders)

  const setFolder = useCallback((shareId: string, config: FolderShareConfig) => {
    setFolders(prev => {
      const next = { ...prev, [shareId]: config }
      saveFolders(next)
      return next
    })
  }, [])

  const removeFolder = useCallback((shareId: string) => {
    setFolders(prev => {
      const next = { ...prev }
      delete next[shareId]
      saveFolders(next)
      return next
    })
  }, [])

  return { folders, setFolder, removeFolder }
}
