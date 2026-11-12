import { useEffect, useRef, useState } from 'react'
import { listPreviewNotes } from '../lib/api'

const POLL_MS = 30000
const CHANGED = 'kexoz:notes-changed'
const SEEN_KEY = 'kexoz-feedback-seen-ids'

/** Tells the sidebar badge to recount after a note changes here. */
export const notesChanged = () => window.dispatchEvent(new Event(CHANGED))

function loadSeen(): Set<string> {
  try {
    const raw = localStorage.getItem(SEEN_KEY)
    if (!raw) return new Set()
    const arr = JSON.parse(raw) as string[]
    return new Set(Array.isArray(arr) ? arr : [])
  } catch {
    return new Set()
  }
}

function saveSeen(ids: Set<string>) {
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify([...ids].slice(-500))
    )
  } catch {
    // ignore
  }
}

/** How many notes across every share still need work, for the sidebar badge. */
export function useOpenFeedback(clientId: string | undefined): number {
  const [count, setCount] = useState(0)
  const primed = useRef(false)

  useEffect(() => {
    if (!clientId) return
    let alive = true
    const load = async () => {
      if (document.hidden) return
      try {
        const notes = await listPreviewNotes(clientId)
        if (!alive) return
        setCount(notes.filter(note => note.status !== 'resolved').length)
        const seen = loadSeen()
        const fresh = notes.filter(note => !seen.has(note.id))
        if (!primed.current) {
          notes.forEach(note => seen.add(note.id))
          saveSeen(seen)
          primed.current = true
          return
        }
        const desktopOn = (() => {
          try {
            const raw = localStorage.getItem('kexoz-notify-desktop')
            return raw == null || raw === '1' || raw === 'true'
          } catch {
            return true
          }
        })()
        for (const note of fresh) {
          seen.add(note.id)
          if (!desktopOn) continue
          const media = !!(note.snapshot || (note as { snapshotId?: string }).snapshotId)
          void window.kexoz?.notify?.({
            title: media ? 'New media feedback' : 'New feedback',
            body: (note.body || 'Someone left a note on your preview').slice(0, 140),
            noteId: note.id,
            tunnelId: note.tunnelId,
          })
        }
        if (fresh.length) saveSeen(seen)
      } catch {
        // The next poll retries.
      }
    }
    void load()
    const id = window.setInterval(() => void load(), POLL_MS)
    const onChange = () => void load()
    window.addEventListener(CHANGED, onChange)
    return () => { alive = false; window.clearInterval(id); window.removeEventListener(CHANGED, onChange) }
  }, [clientId])

  return count
}
