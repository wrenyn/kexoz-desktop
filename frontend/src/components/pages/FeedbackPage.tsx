import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'react-hot-toast'
import { deletePreviewNote, listPreviewNotes, setPreviewNoteStatus, type PersistentTunnel, type PreviewNote } from '../../lib/api'
import { shareUrl } from '../../lib/shares'
import { extractError } from '../../lib/utils'

type Props = {
  clientId: string
  tunnels: PersistentTunnel[]
  tunnelNames: Record<string, string>
  onOpenShares: () => void
}

type StatusFilter = 'open' | 'resolved' | 'all'

const STATUS_FILTERS: { id: StatusFilter; label: string }[] = [
  { id: 'open', label: 'Open' },
  { id: 'resolved', label: 'Resolved' },
  { id: 'all', label: 'All' },
]

function timeAgo(iso: string): string {
  const seconds = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000))
  if (seconds < 60) return 'just now'
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours} h ago`
  return new Date(iso).toLocaleDateString()
}

export default function FeedbackPage({ clientId, tunnels, tunnelNames, onOpenShares }: Props) {
  const [notes, setNotes] = useState<PreviewNote[]>([])
  const [loaded, setLoaded] = useState(false)
  const [shareFilter, setShareFilter] = useState('all')
  const [status, setStatus] = useState<StatusFilter>('open')
  const [busyId, setBusyId] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      setNotes(await listPreviewNotes(clientId))
    } catch {
      // Keep what we have; the next poll retries.
    } finally {
      setLoaded(true)
    }
  }, [clientId])

  useEffect(() => {
    void refresh()
    const id = window.setInterval(() => void refresh(), 20000)
    return () => window.clearInterval(id)
  }, [refresh])

  const byId = useMemo(() => new Map(tunnels.map(tunnel => [tunnel.id, tunnel])), [tunnels])
  const previewShares = tunnels.filter(tunnel => tunnel.preview)
  const shareName = (tunnelId: string) => {
    const tunnel = byId.get(tunnelId)
    if (!tunnel) return 'Deleted share'
    return tunnelNames[tunnel.id] || shareUrl(tunnel).replace(/^https:\/\//, '')
  }

  const visible = notes.filter(note =>
    (shareFilter === 'all' || note.tunnelId === shareFilter) &&
    (status === 'all' || note.status === status))
  const openCount = notes.filter(note => note.status === 'open').length

  const groups = useMemo(() => {
    const map = new Map<string, PreviewNote[]>()
    for (const note of visible) {
      const key = `${note.tunnelId}\u0000${note.path}`
      map.set(key, [...(map.get(key) ?? []), note])
    }
    return [...map.entries()].map(([key, items]) => {
      const [tunnelId, path] = key.split('\u0000')
      return { tunnelId, path, items }
    })
  }, [visible])

  const changeStatus = async (note: PreviewNote, next: PreviewNote['status']) => {
    setBusyId(note.id)
    try {
      await setPreviewNoteStatus(clientId, note.id, next)
      setNotes(current => current.map(item => item.id === note.id ? { ...item, status: next } : item))
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

  const pageUrl = (tunnelId: string, path: string) => {
    const tunnel = byId.get(tunnelId)
    return tunnel ? `${shareUrl(tunnel)}${path.startsWith('/') ? path : `/${path}`}` : ''
  }

  return (
    <div className="ps-main">
      <div className="ps-page-header animate-fade-down">
        <div>
          <h1 className="ps-page-title">Feedback</h1>
          <p className="ps-page-subtitle">
            {openCount > 0 ? `${openCount} open ${openCount === 1 ? 'note' : 'notes'} from your previews` : 'Notes people leave on your interactive previews'}
          </p>
        </div>
        <div className="ps-header-actions">
          <button className="ps-btn ps-btn-secondary ps-btn-sm" onClick={() => void refresh()}>Refresh</button>
        </div>
      </div>

      <div className="ps-page-content">
        {loaded && notes.length === 0 ? (
          <div className="ps-card animate-fade-up">
            <div className="ps-empty">
              <span className="ps-empty-title">No feedback yet</span>
              <span className="ps-empty-sub">
                {previewShares.length === 0
                  ? 'Turn on Interactive preview for a website share, then send the link. Visitors click Add note to pin a comment on the page.'
                  : 'Send the link to someone. They click Add note at the bottom of the page to pin a comment, and it shows up here.'}
              </span>
              {previewShares.length === 0 && (
                <button className="ps-btn ps-btn-primary" onClick={onOpenShares} style={{ marginTop: 8 }}>Go to Shares</button>
              )}
            </div>
          </div>
        ) : (
          <div className="animate-fade-up ps-feedback">
            <div className="ps-feedback-filters">
              <div className="ps-segmented" role="radiogroup" aria-label="Status">
                {STATUS_FILTERS.map(option => (
                  <button
                    key={option.id}
                    type="button"
                    role="radio"
                    aria-checked={status === option.id}
                    className={`ps-segmented-item ${status === option.id ? 'active' : ''}`}
                    onClick={() => setStatus(option.id)}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
              <select className="ps-feedback-select" value={shareFilter} onChange={event => setShareFilter(event.target.value)} aria-label="Share">
                <option value="all">All shares</option>
                {[...new Set(notes.map(note => note.tunnelId))].map(id => (
                  <option key={id} value={id}>{shareName(id)}</option>
                ))}
              </select>
            </div>

            {groups.length === 0 ? (
              <div className="ps-card">
                <div className="ps-empty">
                  <span className="ps-empty-title">{status === 'open' ? 'Nothing open' : 'Nothing here'}</span>
                  <span className="ps-empty-sub">{status === 'open' ? 'Every note has been resolved.' : 'Try a different filter.'}</span>
                </div>
              </div>
            ) : groups.map(group => (
              <section key={`${group.tunnelId}${group.path}`} className="ps-card ps-feedback-group">
                <header className="ps-feedback-group-head">
                  <div>
                    <div className="ps-feedback-share">{shareName(group.tunnelId)}</div>
                    <div className="ps-feedback-path">{group.path}</div>
                  </div>
                  {pageUrl(group.tunnelId, group.path) && (
                    <a className="ps-btn ps-btn-ghost ps-btn-sm" href={pageUrl(group.tunnelId, group.path)} target="_blank" rel="noreferrer">Open page</a>
                  )}
                </header>
                {group.items.map(note => (
                  <article key={note.id} className={`ps-feedback-note ${note.status === 'resolved' ? 'resolved' : ''}`}>
                    <p className="ps-feedback-body">{note.body}</p>
                    <div className="ps-feedback-meta">
                      <span>{note.author || 'Anonymous'} · {timeAgo(note.createdAt)}</span>
                      <div className="ps-feedback-actions">
                        {note.status === 'open' ? (
                          <button className="ps-btn ps-btn-secondary ps-btn-sm" disabled={busyId === note.id} onClick={() => void changeStatus(note, 'resolved')}>Resolve</button>
                        ) : (
                          <button className="ps-btn ps-btn-ghost ps-btn-sm" disabled={busyId === note.id} onClick={() => void changeStatus(note, 'open')}>Reopen</button>
                        )}
                        <button className="ps-btn ps-btn-ghost ps-btn-sm ps-btn-text-danger" disabled={busyId === note.id} onClick={() => void remove(note)}>Delete</button>
                      </div>
                    </div>
                  </article>
                ))}
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
