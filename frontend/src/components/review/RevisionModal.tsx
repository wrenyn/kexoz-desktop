import { useEffect, useMemo, useState } from 'react'
import { toast } from 'react-hot-toast'
import {
  createRevision, updateRevision, uploadRevisionSnapshot,
  type PersistentTunnel, type PreviewNote, type PreviewRevision,
} from '../../lib/api'
import { closeIssueAsFixed, recentChanges, type GitHubLinkOption } from '../../lib/github'
import { normalizeRevision } from '../../hooks/useReview'
import { pagesToCapture, portForPath } from '../../lib/review'
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
  github: { ready: boolean; repo: string }
  onClose: () => void
  onSaved: () => void
}

const splitLinks = (text: string) => text.split(/\s+/).map(line => line.trim()).filter(Boolean)

export default function RevisionModal({ clientId, tunnel, notes, revision, github, onClose, onSaved }: Props) {
  const editing = Boolean(revision)
  const pending = useMemo(() => notes.filter(note => note.status !== 'resolved'), [notes])
  const [label, setLabel] = useState(revision?.label ?? '')
  const [summary, setSummary] = useState(revision?.summary ?? '')
  const [links, setLinks] = useState((revision?.links ?? []).map(link => link.url).join('\n'))
  const [fixes, setFixes] = useState<Set<string>>(() => new Set(pending.filter(note => note.status === 'in_progress').map(note => note.id)))
  const [capture, setCapture] = useState(!editing && Boolean(window.kexoz?.capturePage))
  const [width, setWidth] = useState(1280)
  const [closeIssues, setCloseIssues] = useState(true)
  const [options, setOptions] = useState<GitHubLinkOption[] | null>(null)
  const [progress, setProgress] = useState('')
  const [busy, setBusy] = useState(false)

  const fixedNotes = pending.filter(note => fixes.has(note.id))
  const pages = useMemo(() => pagesToCapture(editing ? notes.filter(note => note.resolvedRevisionId === revision?.id) : fixedNotes), [editing, notes, revision?.id, fixedNotes])
  const withIssues = fixedNotes.filter(note => note.issueUrl)
  const chosen = new Set(splitLinks(links))

  useEffect(() => {
    if (!github.ready || !github.repo) return
    let alive = true
    recentChanges(github.repo).then(list => { if (alive) setOptions(list) }).catch(() => { if (alive) setOptions([]) })
    return () => { alive = false }
  }, [github.ready, github.repo])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape' && !busy) onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [busy, onClose])

  const toggleLink = (url: string) => {
    const next = splitLinks(links)
    setLinks((chosen.has(url) ? next.filter(item => item !== url) : [...next, url]).join('\n'))
  }

  const toggleFix = (id: string) => setFixes(current => {
    const next = new Set(current)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    return next
  })

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
      const linkList = splitLinks(links)
      let target: PreviewRevision
      if (revision) {
        setProgress('Saving…')
        target = normalizeRevision(await updateRevision(clientId, tunnel.id, revision.id, { label: label.trim(), summary: summary.trim(), links: linkList }))
      } else {
        setProgress('Creating the revision…')
        target = normalizeRevision(await createRevision(clientId, tunnel.id, { label: label.trim(), summary: summary.trim(), fixes: [...fixes], links: linkList }))
      }
      const shots = capture ? await capturePages(target) : 0
      let closed = 0
      if (!editing && closeIssues && github.ready) {
        for (const note of withIssues) {
          setProgress('Closing linked issues…')
          try {
            if (await closeIssueAsFixed(note.issueUrl!, target)) closed++
          } catch (err) {
            toast.error(`Couldn’t close an issue: ${extractError(err)}`)
          }
        }
      }
      const parts = [editing ? `Saved v${target.number}` : `Published v${target.number}`]
      if (shots) parts.push(`${shots} screenshot${shots === 1 ? '' : 's'}`)
      if (closed) parts.push(`${closed} issue${closed === 1 ? '' : 's'} closed`)
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
      <div className="ps-modal ps-rv-modal wide" role="dialog" aria-modal="true" aria-labelledby="rev-title">
        <div className="ps-modal-header">
          <h2 className="ps-modal-title" id="rev-title">{revision ? `Edit v${revision.number}` : 'New revision'}</h2>
        </div>
        <div className="ps-modal-body ps-rv-form">
          {!editing && <p className="ps-panel-hint">A revision tells reviewers you’ve shipped changes to this preview. They’ll see it in the toolbar and can approve it or ask for more changes.</p>}

          <label className="ps-label" htmlFor="rev-label">Label</label>
          <input id="rev-label" className="ps-input" maxLength={80} placeholder="Checkout polish" value={label} onChange={event => setLabel(event.target.value)} autoFocus />

          <label className="ps-label" htmlFor="rev-summary">What changed</label>
          <textarea id="rev-summary" className="ps-input" rows={3} maxLength={2000} placeholder="Fixed the button spacing and the broken link in the footer." value={summary} onChange={event => setSummary(event.target.value)} />

          {!editing && (
            <>
              <span className="ps-label">Fixes</span>
              {pending.length === 0 ? (
                <p className="field-help">No open feedback on this share.</p>
              ) : (
                <ul className="ps-rv-checklist">
                  {pending.map(note => (
                    <li key={note.id}>
                      <label className="ps-check">
                        <input type="checkbox" checked={fixes.has(note.id)} onChange={() => toggleFix(note.id)} />
                        <span>
                          <span className="ps-rv-check-body">{note.body}</span>
                          <span className="ps-rv-muted">{note.author || 'Guest'} · {note.path}{note.status === 'in_progress' ? ' · in progress' : ''}</span>
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}

          <label className="ps-label" htmlFor="rev-links">Pull requests and commits</label>
          <textarea id="rev-links" className="ps-input" rows={2} spellCheck={false} placeholder="https://github.com/acme/site/pull/42" value={links} onChange={event => setLinks(event.target.value)} />
          <p className="field-help">One link per line, https only. Reviewers don’t see these; they’re for you and your team.</p>
          {options && options.length > 0 && (
            <ul className="ps-rv-checklist compact" aria-label={`Recent changes in ${github.repo}`}>
              {options.map(option => (
                <li key={option.url}>
                  <label className="ps-check">
                    <input type="checkbox" checked={chosen.has(option.url)} onChange={() => toggleLink(option.url)} />
                    <span>
                      <span className="ps-rv-check-body">{option.label}</span>
                      <span className="ps-rv-muted">{option.detail}</span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          )}

          {window.kexoz?.capturePage && (
            <>
              <label className="ps-check">
                <input type="checkbox" checked={capture} onChange={event => setCapture(event.target.checked)} />
                <span>Capture screenshots from your local app for before-and-after</span>
              </label>
              {capture && (
                <div className="ps-rv-capture">
                  <div className="ps-segmented" role="radiogroup" aria-label="Screenshot width">
                    {WIDTHS.map(option => (
                      <button key={option.value} type="button" role="radio" aria-checked={width === option.value} className={`ps-segmented-item ${width === option.value ? 'active' : ''}`} onClick={() => setWidth(option.value)}>
                        {option.label}
                      </button>
                    ))}
                  </div>
                  <p className="field-help">Pages: {pages.join(', ')}</p>
                </div>
              )}
            </>
          )}

          {!editing && github.ready && withIssues.length > 0 && (
            <label className="ps-check">
              <input type="checkbox" checked={closeIssues} onChange={event => setCloseIssues(event.target.checked)} />
              <span>Close {withIssues.length} linked GitHub issue{withIssues.length === 1 ? '' : 's'} with a link to this revision</span>
            </label>
          )}
        </div>
        <div className="ps-modal-footer">
          {progress && <span className="ps-rv-progress" role="status">{progress}</span>}
          <button type="button" className="ps-btn ps-btn-ghost" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="button" className="ps-btn ps-btn-primary" onClick={() => void save()} disabled={busy}>
            {busy ? 'Working…' : editing ? 'Save' : `Publish${fixes.size ? ` · fixes ${fixes.size}` : ''}`}
          </button>
        </div>
      </div>
    </div>
  )
}
