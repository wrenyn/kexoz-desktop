import { useState } from 'react'
import { toast } from 'react-hot-toast'
import { updateTunnel, type PersistentTunnel, type PreviewNote } from '../../lib/api'
import { shareUrl } from '../../lib/shares'
import { extractError } from '../../lib/utils'

export function PreviewSetting({ clientId, tunnel, onUpdated }: {
  clientId: string
  tunnel: PersistentTunnel
  onUpdated: (tunnel: PersistentTunnel) => void
}) {
  const [saving, setSaving] = useState(false)
  const enabled = Boolean(tunnel.preview)

  const toggle = async (next: boolean) => {
    setSaving(true)
    try {
      onUpdated(await updateTunnel(clientId, { ...tunnel, preview: next }))
      toast.success(next ? 'Interactive preview is on. Visitors see an Add note button.' : 'Interactive preview is off')
    } catch (err) {
      toast.error(extractError(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="ps-share-extra ps-share-extra-inline">
      <label className="ps-ns-toggle-row ps-share-extra-row">
        <span className="ps-ns-toggle-text">
          <span className="ps-ns-toggle-title">Interactive preview</span>
          <span className="ps-ns-toggle-desc">Visitors can click anywhere on a page to leave a note.</span>
        </span>
        <span className="ps-toggle">
          <input type="checkbox" aria-label="Interactive preview" checked={enabled} disabled={saving} onChange={event => void toggle(event.target.checked)} />
          <span className="ps-toggle-track" />
        </span>
      </label>
    </div>
  )
}

function timeAgo(iso: string): string {
  const seconds = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000))
  if (seconds < 60) return 'just now'
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours} h ago`
  return new Date(iso).toLocaleDateString()
}

export function ShareFeedback({ tunnel, notes, busyId, onStatus, onDelete }: {
  tunnel: PersistentTunnel
  notes: PreviewNote[]
  busyId: string | null
  onStatus: (note: PreviewNote, status: PreviewNote['status']) => void
  onDelete: (note: PreviewNote) => void
}) {
  const [showResolved, setShowResolved] = useState(false)
  const open = notes.filter(note => note.status === 'open')
  const resolved = notes.length - open.length
  const visible = showResolved ? notes : open
  const pageUrl = (path: string) => `${shareUrl(tunnel)}${path.startsWith('/') ? path : `/${path}`}`

  return (
    <div className="ps-share-extra">
      <div className="ps-share-extra-head">
        <div>
          <span className="ps-label">Feedback</span>
          <p className="ps-settings-row-desc">
            {notes.length === 0
              ? tunnel.preview
                ? 'Send the link to someone. Notes they pin on the page show up here.'
                : 'Turn on interactive preview to collect notes.'
              : open.length > 0
                ? `${open.length} open ${open.length === 1 ? 'note' : 'notes'}`
                : 'Every note is resolved.'}
          </p>
        </div>
        {resolved > 0 && (
          <button type="button" className="ps-btn ps-btn-ghost ps-btn-sm" onClick={() => setShowResolved(v => !v)}>
            {showResolved ? 'Hide resolved' : `Show resolved (${resolved})`}
          </button>
        )}
      </div>

      {visible.length > 0 && (
        <ul className="ps-share-notes">
          {visible.map(note => (
            <li key={note.id} className={note.status === 'resolved' ? 'resolved' : ''}>
              <p className="ps-feedback-body">{note.body}</p>
              <div className="ps-feedback-meta">
                <span>
                  {note.author || 'Anonymous'} · {timeAgo(note.createdAt)} ·{' '}
                  <a href={pageUrl(note.path)} target="_blank" rel="noreferrer" className="ps-share-note-path">{note.path || '/'}</a>
                </span>
                <div className="ps-feedback-actions">
                  {note.status === 'open' ? (
                    <button className="ps-btn ps-btn-secondary ps-btn-sm" disabled={busyId === note.id} onClick={() => onStatus(note, 'resolved')}>Resolve</button>
                  ) : (
                    <button className="ps-btn ps-btn-ghost ps-btn-sm" disabled={busyId === note.id} onClick={() => onStatus(note, 'open')}>Reopen</button>
                  )}
                  <button className="ps-btn ps-btn-ghost ps-btn-sm ps-btn-text-danger" disabled={busyId === note.id} onClick={() => onDelete(note)}>Delete</button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
