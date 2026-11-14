import { useDialog } from '../../hooks/useDialog'
import { useMemo, useState } from 'react'
import { toast } from 'react-hot-toast'
import {
  createRevision, updateRevision, uploadRevisionSnapshot,
  type PersistentTunnel, type PreviewNote, type PreviewRevision,
} from '../../lib/api'
import { normalizeRevision } from '../../hooks/useReview'
import { pagesToCapture, portForPath, revisionName } from '../../lib/review'
import { extraRoutes } from '../../lib/shares'
import { extractError } from '../../lib/utils'

const WIDTHS = [
  { value: 1280, label: 'Desktop' },
  { value: 768, label: 'Tablet' },
  { value: 375, label: 'Phone' },
]

type Props = {
  clientId: string
  tunnel: PersistentTunnel
  notes: PreviewNote[]
  /** Edit this revision instead of creating one. */
  revision?: PreviewRevision
  onClose: () => void
  onSaved: () => void
}

export default function RevisionModal({ clientId, tunnel, notes, revision, onClose, onSaved }: Props) {
  const editing = Boolean(revision)
  const pending = useMemo(() => notes.filter(note => note.status !== 'resolved'), [notes])
  const [label, setLabel] = useState(revision?.label ?? '')
  const [summary, setSummary] = useState(revision?.summary ?? '')
  const [fixes, setFixes] = useState<Set<string>>(() => new Set(pending.filter(note => note.status === 'in_progress').map(note => note.id)))
  const [capture, setCapture] = useState(!editing && Boolean(window.kexoz?.capturePage))
  const [width, setWidth] = useState(1280)
  const [progress, setProgress] = useState('')
  const [busy, setBusy] = useState(false)
  const dialogRef = useDialog(() => { if (!busy) onClose() })

  const fixedNotes = pending.filter(note => fixes.has(note.id))
  const pages = useMemo(
    () => pagesToCapture(editing ? notes.filter(note => note.resolvedRevisionId === revision?.id) : fixedNotes),
    [editing, notes, revision?.id, fixedNotes],
  )



  const toggleFix = (id: string) => setFixes(current => {
    const next = new Set(current)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    return next
  })

  const selectAll = () => setFixes(new Set(pending.map(note => note.id)))
  const clearFixes = () => setFixes(new Set())

  const capturePages = async (target: PreviewRevision): Promise<number> => {
    const shoot = window.kexoz?.capturePage
    if (!shoot) return 0
    let saved = 0
    for (const [index, path] of pages.entries()) {
      const port = portForPath(tunnel, path)
      setProgress(`Capturing ${path} (${index + 1} of ${pages.length})…`)
      try {
        if (window.kexoz?.checkPort && !(await window.kexoz.checkPort(port))) throw new Error(`nothing is running on port ${port}`)
        const shot = await shoot({ port: tunnel.port, path, width, routes: extraRoutes(tunnel) })
        await uploadRevisionSnapshot(clientId, tunnel.id, target.id, shot.data, { path, viewportW: shot.viewportW, scale: shot.scale })
        saved++
      } catch (err) {
        toast.error(`Couldn’t capture ${path}: ${extractError(err)}`)
      }
    }
    return saved
  }

  const save = async () => {
    setBusy(true)
    try {
      const existingLinks = (revision?.links ?? []).map(link => link.url)
      let target: PreviewRevision
      if (revision) {
        setProgress('Saving…')
        target = normalizeRevision(await updateRevision(clientId, tunnel.id, revision.id, {
          label: label.trim(),
          summary: summary.trim(),
          links: existingLinks,
        }))
      } else {
        setProgress('Publishing…')
        target = normalizeRevision(await createRevision(clientId, tunnel.id, {
          label: label.trim(),
          summary: summary.trim(),
          fixes: [...fixes],
          links: [],
        }))
      }
      const shots = capture ? await capturePages(target) : 0
      const parts = [editing ? `Saved ${revisionName(target)}` : `Published ${revisionName(target)}`]
      if (shots) parts.push(`${shots} screenshot${shots === 1 ? '' : 's'}`)
      toast.success(parts.join(' · '))
      onSaved()
      onClose()
    } catch (err) {
      toast.error(extractError(err))
    } finally {
      setBusy(false)
      setProgress('')
    }
  }

  return (
    <div className="ps-modal-overlay" onMouseDown={event => { if (event.target === event.currentTarget && !busy) onClose() }}>
      <div ref={dialogRef} tabIndex={-1} className="ps-modal ps-rv-modal" role="dialog" aria-modal="true" aria-labelledby="rev-title">
        <div className="ps-modal-header">
          <div>
            <h2 className="ps-modal-title" id="rev-title">{revision ? `Edit ${revisionName(revision)}` : 'New version'}</h2>
            {!editing && (
              <p className="ps-modal-sub">
                Tell reviewers you shipped changes on this preview. They can approve or ask for more.
              </p>
            )}
          </div>
        </div>

        <div className="ps-modal-body ps-rv-form">
          <div className="ps-rv-form-block">
            <label className="ps-label" htmlFor="rev-label">Title</label>
            <input
              id="rev-label"
              className="ps-input"
              maxLength={80}
              placeholder="Checkout polish"
              value={label}
              onChange={event => setLabel(event.target.value)}
              autoFocus
            />
          </div>

          <div className="ps-rv-form-block">
            <label className="ps-label" htmlFor="rev-summary">What changed</label>
            <textarea
              id="rev-summary"
              className="ps-input"
              rows={3}
              maxLength={2000}
              placeholder="Fixed button spacing and the broken footer link."
              value={summary}
              onChange={event => setSummary(event.target.value)}
            />
          </div>

          {!editing && (
            <div className="ps-rv-form-block">
              <div className="ps-rv-form-block-head">
                <span className="ps-label">Marks these notes fixed</span>
                {pending.length > 0 && (
                  <span className="ps-rv-form-tools">
                    <button type="button" className="ps-rv-link" onClick={selectAll}>All</button>
                    <button type="button" className="ps-rv-link" onClick={clearFixes}>None</button>
                  </span>
                )}
              </div>
              {pending.length === 0 ? (
                <p className="field-help">No open feedback on this share.</p>
              ) : (
                <ul className="ps-rv-checklist">
                  {pending.map(note => {
                    const checked = fixes.has(note.id)
                    const preview = note.body.trim().split(/\n/)[0].slice(0, 90)
                    return (
                      <li key={note.id} className={checked ? 'is-checked' : ''}>
                        <label className="ps-check ps-rv-fix-row">
                          <input type="checkbox" checked={checked} onChange={() => toggleFix(note.id)} />
                          <span className="ps-rv-fix-copy">
                            <span className="ps-rv-check-body">{preview || 'Untitled note'}</span>
                            <span className="ps-rv-muted">
                              {note.author || 'Guest'}
                              {' · '}
                              <code>{note.path || '/'}</code>
                              {note.status === 'in_progress' ? ' · In progress' : ''}
                            </span>
                          </span>
                        </label>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          )}

          {window.kexoz?.capturePage && (
            <div className="ps-rv-form-block">
              <label className="ps-check">
                <input type="checkbox" checked={capture} onChange={event => setCapture(event.target.checked)} />
                <span>Capture before/after screenshots from localhost</span>
              </label>
              {capture && (
                <div className="ps-rv-capture">
                  <div className="ps-segmented" role="radiogroup" aria-label="Screenshot width">
                    {WIDTHS.map(option => (
                      <button
                        key={option.value}
                        type="button"
                        role="radio"
                        aria-checked={width === option.value}
                        className={`ps-segmented-item ${width === option.value ? 'active' : ''}`}
                        onClick={() => setWidth(option.value)}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                  <p className="field-help">
                    {pages.length === 0 ? 'No pages to capture yet — pick notes above or leave a note on a path first.' : `Pages: ${pages.join(', ')}`}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="ps-modal-footer">
          {progress && <span className="ps-rv-progress" role="status">{progress}</span>}
          <button type="button" className="ps-btn ps-btn-ghost" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="button" className="ps-btn ps-btn-primary" onClick={() => void save()} disabled={busy}>
            {busy ? 'Working…' : editing ? 'Save' : `Publish${fixes.size ? ` · ${fixes.size} fixed` : ''}`}
          </button>
        </div>
      </div>
    </div>
  )
}
