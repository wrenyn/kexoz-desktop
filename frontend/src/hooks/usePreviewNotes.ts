import { useCallback, useEffect, useState } from 'react'
import { toast } from 'react-hot-toast'
import { deletePreviewNote, listPreviewNotes, setPreviewNoteStatus, type PreviewNote } from '../lib/api'
import { extractError } from '../lib/utils'

const POLL_MS = 20000

/** Notes visitors pinned on interactive previews, for every share, refreshed while mounted. */
export function usePreviewNotes(clientId: string) {
  const [notes, setNotes] = useState<PreviewNote[]>([])
  const [busyId, setBusyId] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      setNotes(await listPreviewNotes(clientId))
    } catch {
      // Keep what we have; the next poll retries.
    }
  }, [clientId])

  useEffect(() => {
    void refresh()
    const id = window.setInterval(() => void refresh(), POLL_MS)
    return () => window.clearInterval(id)
  }, [refresh])

  const setStatus = async (note: PreviewNote, status: PreviewNote['status']) => {
    setBusyId(note.id)
    try {
      await setPreviewNoteStatus(clientId, note.id, status)
      setNotes(current => current.map(item => item.id === note.id ? { ...item, status } : item))
    } catch (err) {
      toast.error(extractError(err))
    } finally {
      setBusyId(null)
    }
  }

  const remove = async (note: PreviewNote) => {
    setBusyId(note.id)
    try {
      await deletePreviewNote(clientId, note.id)
      setNotes(current => current.filter(item => item.id !== note.id))
    } catch (err) {
      toast.error(extractError(err))
    } finally {
      setBusyId(null)
    }
  }

  return { notes, busyId, refresh, setStatus, remove }
}
