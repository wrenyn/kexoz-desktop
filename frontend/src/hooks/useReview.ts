import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'react-hot-toast'
import {
  changePreviewNote, deletePreviewNote, deleteReply, deleteRevision, listPreviewNotes, listRevisions, replyToNote, setNoteIssue,
  type NoteAction, type PreviewNote, type PreviewRevision,
} from '../lib/api'
import { extractError } from '../lib/utils'
import { notesChanged } from './useOpenFeedback'

const POLL_MS = 15000

export const normalizeRevision = (revision: PreviewRevision): PreviewRevision => ({
  ...revision,
  snapshots: revision.snapshots ?? [],
  links: revision.links ?? [],
  approvals: revision.approvals ?? [],
})

/** One share's notes and revisions, refreshed while the review page is open. */
export function useReview(clientId: string, tunnelId: string | null) {
  const [notes, setNotes] = useState<PreviewNote[]>([])
  const [revisions, setRevisions] = useState<PreviewRevision[]>([])
  const [loaded, setLoaded] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const current = useRef(tunnelId)
  current.current = tunnelId

  const refresh = useCallback(async () => {
    if (!tunnelId) return
    try {
      const [nextNotes, nextRevisions] = await Promise.all([listPreviewNotes(clientId, tunnelId), listRevisions(clientId, tunnelId)])
      if (current.current !== tunnelId) return
      setNotes(nextNotes.map(note => ({ ...note, replies: note.replies ?? [] })))
      setRevisions(nextRevisions.map(normalizeRevision))
    } catch {
      // Keep what we have; the next poll retries.
    } finally {
      if (current.current === tunnelId) setLoaded(true)
    }
  }, [clientId, tunnelId])

  useEffect(() => {
    setNotes([])
    setRevisions([])
    setLoaded(false)
    void refresh()
    const id = window.setInterval(() => { if (!document.hidden) void refresh() }, POLL_MS)
    return () => window.clearInterval(id)
  }, [refresh])

  const replace = (note: PreviewNote) =>
    setNotes(list => list.map(item => item.id === note.id ? { ...note, replies: note.replies ?? [] } : item))

  const run = async (id: string, work: () => Promise<void>): Promise<boolean> => {
    setBusyId(id)
    try {
      await work()
      notesChanged()
      return true
    } catch (err) {
      toast.error(extractError(err))
      return false
    } finally {
      setBusyId(null)
    }
  }

  const act = (note: PreviewNote, action: NoteAction, options: { revisionId?: string; comment?: string } = {}) =>
    run(note.id, async () => {
      const updated = await changePreviewNote(clientId, note.id, action, options)
      if (updated) replace(updated)
      if (action === 'resolve') void refresh()
    })

  const reply = (note: PreviewNote, body: string) =>
    run(note.id, async () => {
      const added = await replyToNote(clientId, note.id, body)
      setNotes(list => list.map(item => item.id === note.id ? { ...item, replies: [...(item.replies ?? []), added] } : item))
    })

  const removeReply = (note: PreviewNote, replyId: string) =>
    run(note.id, async () => {
      await deleteReply(clientId, note.id, replyId)
      setNotes(list => list.map(item => item.id === note.id ? { ...item, replies: (item.replies ?? []).filter(r => r.id !== replyId) } : item))
    })

  const removeNote = (note: PreviewNote) =>
    run(note.id, async () => {
      await deletePreviewNote(clientId, note.id)
      setNotes(list => list.filter(item => item.id !== note.id))
    })

  const linkIssue = (note: PreviewNote, url: string) =>
    run(note.id, async () => { replace(await setNoteIssue(clientId, note.id, url)) })

  const removeRevision = (revision: PreviewRevision) =>
    run(revision.id, async () => {
      if (!tunnelId) return
      await deleteRevision(clientId, tunnelId, revision.id)
      await refresh()
    })

  return { notes, revisions, loaded, busyId, refresh, act, reply, removeReply, removeNote, linkIssue, removeRevision, setRevisions }
}
