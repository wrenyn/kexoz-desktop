import type { PreviewNote } from './api'

// Same colours and order as the overlay on the page (server preview_script.go),
// so a person has one colour everywhere.
const OWNER_COLOR = '#C6F36B'
const RESOLVED_COLOR = '#A7B0A9'
const PALETTE = ['#7AB8FF', '#FF8FB1', '#FFC470', '#B79CFF', '#5EE0D0', '#FF9E6B', '#F2E57A', '#E59CFF', '#9FD4FF']

const keyOf = (note: PreviewNote) => note.authorKey || `name:${note.author || ''}`

/** Maps each note id to its pin colour, given every note on one share. */
export function noteColors(notes: PreviewNote[]): Map<string, string> {
  const order = new Map<string, number>()
  const byTime = [...notes].sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  for (const note of byTime) {
    if (note.authorRole !== 'owner' && !order.has(keyOf(note))) order.set(keyOf(note), order.size)
  }
  const colors = new Map<string, string>()
  for (const note of notes) {
    colors.set(note.id,
      note.status === 'resolved' ? RESOLVED_COLOR :
      note.authorRole === 'owner' ? OWNER_COLOR :
      PALETTE[(order.get(keyOf(note)) ?? 0) % PALETTE.length])
  }
  return colors
}
