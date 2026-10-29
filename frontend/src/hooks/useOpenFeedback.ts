import { useEffect, useState } from 'react'
import { listPreviewNotes } from '../lib/api'

const POLL_MS = 30000
const CHANGED = 'kexoz:notes-changed'

/** Tells the sidebar badge to recount after a note changes here. */
export const notesChanged = () => window.dispatchEvent(new Event(CHANGED))

/** How many notes across every share still need work, for the sidebar badge. */
export function useOpenFeedback(clientId: string | undefined): number {
  const [count, setCount] = useState(0)

  useEffect(() => {
    if (!clientId) return
    let alive = true
    const load = async () => {
      if (document.hidden) return
      try {
        const notes = await listPreviewNotes(clientId)
        if (alive) setCount(notes.filter(note => note.status !== 'resolved').length)
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
