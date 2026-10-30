import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'react-hot-toast'
import { createReviewLink, type PersistentTunnel, type PreviewNote, type PreviewRevision } from '../../lib/api'
import { createIssueForNote, githubAvailable, githubStatus, repoForShare, setRepoForShare, type GitHubStatus } from '../../lib/github'
import { noteColors } from '../../lib/noteColors'
import { afterShot, approvalSummary, latestDecisions, revisionName, timeAgo } from '../../lib/review'
import { isGatedType, shareLabel, shareUrl } from '../../lib/shares'
import { extractError } from '../../lib/utils'
import { useConfirm } from '../../hooks/useConfirm'
import { notesChanged } from '../../hooks/useOpenFeedback'
import { useReview } from '../../hooks/useReview'
import CompareView, { type CompareSide } from '../review/CompareView'
import GitHubModal from '../review/GitHubModal'
import NoteThread from '../review/NoteThread'
import RevisionModal from '../review/RevisionModal'
import Snapshot from '../review/Snapshot'

type Tab = 'feedback' | 'revisions' | 'compare'
type Filter = 'open' | 'in_progress' | 'resolved' | 'all'

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'open', label: 'Open' },
  { id: 'in_progress', label: 'In progress' },
  { id: 'resolved', label: 'Fixed' },
  { id: 'all', label: 'All' },
]

type Props = {
  clientId: string
  tunnels: PersistentTunnel[]
  selectedId: string | null
  onSelect: (tunnelId: string) => void
}

export default function ReviewPage({ clientId, tunnels, selectedId, onSelect }: Props) {
  const shares = useMemo(() => tunnels.filter(tunnel => isGatedType(tunnel.tunnelType)), [tunnels])
  const tunnel = shares.find(item => item.id === selectedId) ?? shares[0] ?? null
  const review = useReview(clientId, tunnel?.id ?? null)
  const { notes, revisions, loaded, busyId } = review
  const { confirm, dialog } = useConfirm()
  const [tab, setTab] = useState<Tab>('feedback')
  const [filter, setFilter] = useState<Filter>('open')
  const [modal, setModal] = useState<{ kind: 'revision'; revision?: PreviewRevision } | { kind: 'github' } | null>(null)
  const [viewing, setViewing] = useState<PreviewNote | null>(null)
  const [opening, setOpening] = useState(false)
  const [gh, setGh] = useState<GitHubStatus>({ connected: false, login: '', encrypted: false })
  const [repo, setRepo] = useState('')

  useEffect(() => {
    if (githubAvailable()) githubStatus().then(setGh).catch(() => {})
  }, [])

  useEffect(() => { setRepo(tunnel ? repoForShare(tunnel.id) : '') }, [tunnel])

  const github = { ready: gh.connected, repo }
  const colors = useMemo(() => noteColors(notes), [notes])
  const numbers = useMemo(() => {
    const order = [...notes].sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    return new Map(order.map((note, index) => [note.id, index + 1]))
  }, [notes])
  const counts = useMemo(() => ({
    open: notes.filter(note => note.status === 'open').length,
    in_progress: notes.filter(note => note.status === 'in_progress').length,
    resolved: notes.filter(note => note.status === 'resolved').length,
    all: notes.length,
  }), [notes])
  const shown = useMemo(() => notes
    .filter(note => filter === 'all' || note.status === filter)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt)), [notes, filter])

  const openAsOwner = async () => {
    if (!tunnel) return
    setOpening(true)
    try {
      const query = await createReviewLink(clientId, tunnel.id)
      window.open(`${shareUrl(tunnel)}/?${query}`, '_blank', 'noopener')
    } catch (err) {
      toast.error(extractError(err))
    } finally {
      setOpening(false)
    }
  }

  const createIssue = async (note: PreviewNote) => {
    if (!tunnel || !repo) return
    try {
      const url = await createIssueForNote(repo, tunnel, note)
      if (await review.linkIssue(note, url)) toast.success('Issue created')
    } catch (err) {
      toast.error(extractError(err))
    }
  }

  const removeNote = async (note: PreviewNote) => {
    const ok = await confirm({ title: 'Delete this feedback?', message: 'The note, its replies and its screenshot are removed for everyone.', confirmLabel: 'Delete', tone: 'danger' })
    if (ok) await review.removeNote(note)
  }

  const removeRevision = async (revision: PreviewRevision) => {
    const ok = await confirm({
      title: `Delete ${revisionName(revision)}?`,
      message: 'Its screenshots and approvals are removed. Feedback it fixed stays fixed.',
      confirmLabel: 'Delete', tone: 'danger',
    })
    if (ok) await review.removeRevision(revision)
  }

  const saveRepo = (next: string) => {
    if (!tunnel) return
    setRepoForShare(tunnel.id, next)
    setRepo(repoForShare(tunnel.id))
  }

  const closeModal = useCallback(() => setModal(null), [])

  if (!tunnel) {
    return (
      <div className="ps-main">
        <div className="ps-page-header animate-fade-down">
          <div>
            <h1 className="ps-page-title">Review</h1>
            <p className="ps-page-subtitle">Feedback, revisions and approvals for your previews</p>
          </div>
        </div>
        <div className="ps-page-content animate-fade-up">
          <div className="ps-card">
            <div className="ps-empty">
              <span className="ps-empty-title">No web shares yet</span>
              <span className="ps-empty-sub">Share a web app and turn on preview tools; reviewers can then pin feedback right on the page.</span>
            </div>
          </div>
        </div>
      </div>
    )
  }

  const viewingAfter = viewing ? afterShot(viewing, revisions) : null
  const viewingBefore: CompareSide | undefined = viewing?.snapshot ? { shot: viewing.snapshot, label: 'What they saw' } : undefined

  return (
    <div className="ps-main">
      <div className="ps-page-header animate-fade-down">
        <div>
          <h1 className="ps-page-title">Review</h1>
          <p className="ps-page-subtitle">
            {counts.open + counts.in_progress === 0 ? 'No open feedback' : `${counts.open} open · ${counts.in_progress} in progress`}
            {revisions.length > 0 && ` · latest ${revisionName(revisions[revisions.length - 1])}`}
          </p>
        </div>
        <div className="ps-rv-header-actions">
          <select className="ps-select" value={tunnel.id} onChange={event => onSelect(event.target.value)} aria-label="Share">
            {shares.map(item => <option key={item.id} value={item.id}>{shareLabel(item)}</option>)}
          </select>
          {githubAvailable() && (
            <button type="button" className="ps-btn ps-btn-ghost ps-btn-sm" onClick={() => setModal({ kind: 'github' })}>
              {gh.connected ? (repo || 'Pick a repository') : 'Connect GitHub'}
            </button>
          )}
          <button type="button" className="ps-btn ps-btn-secondary ps-btn-sm" onClick={() => void openAsOwner()} disabled={opening || !tunnel.preview}>
            {opening ? 'Opening…' : 'Open as owner'}
          </button>
          <button type="button" className="ps-btn ps-btn-primary ps-btn-sm" onClick={() => setModal({ kind: 'revision' })}>New revision</button>
        </div>
      </div>

      <div className="ps-page-content animate-fade-up">
        {!tunnel.preview && (
          <div className="ps-card ps-rv-callout">
            Preview tools are off for this share, so reviewers can’t leave new feedback. Turn them on in the share’s settings.
          </div>
        )}

        <div className="ps-rv-tabs" role="tablist">
          {([
            ['feedback', `Feedback${counts.open + counts.in_progress ? ` · ${counts.open + counts.in_progress}` : ''}`],
            ['revisions', `Revisions${revisions.length ? ` · ${revisions.length}` : ''}`],
            ['compare', 'Compare'],
          ] as const).map(([id, label]) => (
            <button key={id} type="button" role="tab" aria-selected={tab === id} className={`ps-tab ${tab === id ? 'active' : ''}`} onClick={() => setTab(id)}>{label}</button>
          ))}
        </div>

        {tab === 'feedback' && (
          <>
            <div className="ps-segmented ps-rv-filter" role="radiogroup" aria-label="Show">
              {FILTERS.map(option => (
                <button key={option.id} type="button" role="radio" aria-checked={filter === option.id} className={`ps-segmented-item ${filter === option.id ? 'active' : ''}`} onClick={() => setFilter(option.id)}>
                  {option.label} <span className="ps-rv-count">{counts[option.id]}</span>
                </button>
              ))}
            </div>
            {!loaded ? (
              <div className="ps-card"><div className="ps-empty"><span className="ps-empty-sub">Loading feedback…</span></div></div>
            ) : shown.length === 0 ? (
              <div className="ps-card">
                <div className="ps-empty">
                  <span className="ps-empty-title">{filter === 'all' ? 'No feedback yet' : `Nothing ${FILTERS.find(f => f.id === filter)?.label.toLowerCase()}`}</span>
                  <span className="ps-empty-sub">Send the link to a reviewer; they click Add note on the page and pin it where something needs work.</span>
                </div>
              </div>
            ) : (
              <div className="ps-rv-notes">
                {shown.map(note => (
                  <NoteThread
                    key={note.id}
                    clientId={clientId}
                    tunnel={tunnel}
                    note={note}
                    number={numbers.get(note.id) ?? 0}
                    color={colors.get(note.id) ?? '#888'}
                    revisions={revisions}
                    busy={busyId === note.id}
                    github={github}
                    onAct={(action, options) => review.act(note, action, options)}
                    onReply={body => review.reply(note, body)}
                    onDeleteReply={replyId => void review.removeReply(note, replyId)}
                    onDelete={() => void removeNote(note)}
                    onCreateIssue={() => void createIssue(note)}
                    onLinkIssue={url => review.linkIssue(note, url)}
                    onCompare={() => setViewing(note)}
                  />
                ))}
              </div>
            )}
          </>
        )}

        {tab === 'revisions' && (
          <RevisionList
            clientId={clientId}
            notes={notes}
            revisions={revisions}
            busyId={busyId}
            onEdit={revision => setModal({ kind: 'revision', revision })}
            onDelete={revision => void removeRevision(revision)}
          />
        )}

        {tab === 'compare' && <ComparePanel clientId={clientId} revisions={revisions} />}
      </div>

      {modal?.kind === 'revision' && (
        <RevisionModal
          clientId={clientId}
          tunnel={tunnel}
          notes={notes}
          revision={modal.revision}
          github={github}
          onClose={closeModal}
          onSaved={() => { void review.refresh(); notesChanged() }}
        />
      )}
      {modal?.kind === 'github' && (
        <GitHubModal status={gh} repo={repo} shareName={shareLabel(tunnel)} onStatus={setGh} onRepo={saveRepo} onClose={closeModal} />
      )}
      {viewing && (viewingBefore || viewingAfter) && (
        <div className="ps-modal-overlay" onMouseDown={event => { if (event.target === event.currentTarget) setViewing(null) }}>
          <div className="ps-modal ps-rv-modal viewer" role="dialog" aria-modal="true" aria-label="Screenshots">
            <div className="ps-modal-header">
              <h2 className="ps-modal-title">{viewing.body.split('\n')[0].slice(0, 80)}</h2>
            </div>
            <div className="ps-modal-body">
              <CompareView
                clientId={clientId}
                before={viewingBefore}
                after={viewingAfter ? { shot: viewingAfter.shot, label: `After · v${viewingAfter.revision.number}` } : undefined}
                note={viewing}
                color={colors.get(viewing.id)}
              />
            </div>
            <div className="ps-modal-footer">
              <button type="button" className="ps-btn ps-btn-secondary" onClick={() => setViewing(null)}>Close</button>
            </div>
          </div>
        </div>
      )}
      {dialog}
    </div>
  )
}

function RevisionList({ clientId, notes, revisions, busyId, onEdit, onDelete }: {
  clientId: string
  notes: PreviewNote[]
  revisions: PreviewRevision[]
  busyId: string | null
  onEdit: (revision: PreviewRevision) => void
  onDelete: (revision: PreviewRevision) => void
}) {
  const [expanded, setExpanded] = useState<string | null>(null)

  if (revisions.length === 0) {
    return (
      <div className="ps-card">
        <div className="ps-empty">
          <span className="ps-empty-title">No revisions yet</span>
          <span className="ps-empty-sub">Publish one after you ship changes; reviewers see which feedback it fixes and can approve it.</span>
        </div>
      </div>
    )
  }

  return (
    <div className="ps-rv-revisions">
      {[...revisions].reverse().map(revision => {
        const verdict = approvalSummary(revision)
        const fixedNotes = notes.filter(note => note.resolvedRevisionId === revision.id)
        const confirmed = fixedNotes.filter(note => note.verifiedAt).length
        const open = expanded === revision.id
        return (
          <article key={revision.id} className="ps-card ps-rv-revision">
            <header className="ps-rv-revision-head">
              <strong>{revisionName(revision)}</strong>
              <span className="ps-rv-muted">{timeAgo(revision.createdAt)}</span>
              <span className={`ps-badge ${verdict.className}`}>{verdict.label}</span>
              <span className="ps-rv-actions-end">
                <button type="button" className="ps-btn ps-btn-ghost ps-btn-sm" onClick={() => onEdit(revision)}>Edit</button>
                <button type="button" className="ps-btn ps-btn-ghost ps-btn-sm ps-btn-text-danger" disabled={busyId === revision.id} onClick={() => onDelete(revision)}>Delete</button>
              </span>
            </header>
            {revision.summary && <p className="ps-rv-note-body">{revision.summary}</p>}
            <p className="ps-rv-meta">
              {revision.fixed === 0 ? 'No feedback marked fixed' : `Fixes ${revision.fixed} note${revision.fixed === 1 ? '' : 's'}${confirmed ? ` · ${confirmed} confirmed by reviewers` : ''}`}
            </p>
            {revision.links.length > 0 && (
              <ul className="ps-rv-links">
                {revision.links.map(link => (
                  <li key={link.url}><a href={link.url} target="_blank" rel="noreferrer" className={`ps-rv-chip ${link.kind}`}>{link.label}</a></li>
                ))}
              </ul>
            )}
            {revision.snapshots.length > 0 && (
              <div className="ps-rv-thumbs">
                {revision.snapshots.map(shot => (
                  <figure key={shot.id}>
                    <Snapshot clientId={clientId} shot={shot} alt={`${shot.path} in v${revision.number}`} frame={4 / 3} />
                    <figcaption>{shot.path} · {shot.viewportW}px</figcaption>
                  </figure>
                ))}
              </div>
            )}
            {revision.approvals.length > 0 && (
              <div className="ps-rv-approvals">
                <button type="button" className="ps-rv-link" onClick={() => setExpanded(open ? null : revision.id)} aria-expanded={open}>
                  {latestDecisions(revision).map(item => `${item.author} ${item.decision === 'approved' ? 'approved' : 'asked for changes'}`).join(' · ')}
                  {' '}{open ? '▲' : '▼'}
                </button>
                {open && (
                  <ol className="ps-rv-history">
                    {[...revision.approvals].reverse().map(item => (
                      <li key={item.id}>
                        <span className={item.decision === 'approved' ? 'ps-rv-ok' : 'ps-rv-no'}>{item.decision === 'approved' ? '✓ Approved' : '✕ Changes requested'}</span>
                        <strong>{item.author}</strong>
                        <span className="ps-rv-muted">{timeAgo(item.createdAt)}</span>
                        {item.comment && <p>{item.comment}</p>}
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            )}
          </article>
        )
      })}
    </div>
  )
}

function ComparePanel({ clientId, revisions }: { clientId: string; revisions: PreviewRevision[] }) {
  const captured = revisions.filter(revision => revision.snapshots.length > 0)
  const [beforeId, setBeforeId] = useState('')
  const [afterId, setAfterId] = useState('')
  const [path, setPath] = useState('')

  const after = captured.find(item => item.id === afterId) ?? captured[captured.length - 1]
  const before = captured.find(item => item.id === beforeId) ?? captured[captured.length - 2] ?? after
  const paths = [...new Set([...(before?.snapshots ?? []), ...(after?.snapshots ?? [])].map(shot => shot.path))]
  const page = paths.includes(path) ? path : paths[0] ?? ''
  const pick = (revision: PreviewRevision | undefined): CompareSide | undefined => {
    const shot = revision?.snapshots.filter(item => item.path === page).at(-1)
    return shot && revision ? { shot, label: `v${revision.number}` } : undefined
  }

  if (captured.length === 0) {
    return (
      <div className="ps-card">
        <div className="ps-empty">
          <span className="ps-empty-title">Nothing to compare yet</span>
          <span className="ps-empty-sub">Tick “Capture screenshots” when you publish a revision; each one keeps a picture of your pages to compare against.</span>
        </div>
      </div>
    )
  }

  const left = before?.id === after?.id ? undefined : pick(before)
  const right = pick(after)

  const single = captured.length === 1

  return (
    <div className="ps-card ps-rv-compare-card">
      {single && (
        <p className="field-help">
          Publish another revision with screenshots to compare it against {revisionName(captured[0])}. To check a single fix, click its screenshot under Feedback.
        </p>
      )}
      <div className="ps-rv-compare-controls">
        {!single && <>
        <label>
          <span className="ps-label">Before</span>
          <select className="ps-select" value={before?.id ?? ''} onChange={event => setBeforeId(event.target.value)}>
            {captured.map(revision => <option key={revision.id} value={revision.id}>{revisionName(revision)}</option>)}
          </select>
        </label>
        <label>
          <span className="ps-label">After</span>
          <select className="ps-select" value={after?.id ?? ''} onChange={event => setAfterId(event.target.value)}>
            {captured.map(revision => <option key={revision.id} value={revision.id}>{revisionName(revision)}</option>)}
          </select>
        </label>
        </>}
        <label>
          <span className="ps-label">Page</span>
          <select className="ps-select" value={page} onChange={event => setPath(event.target.value)}>
            {paths.map(item => <option key={item} value={item}>{item}</option>)}
          </select>
        </label>
      </div>
      {left || right ? (
        <CompareView clientId={clientId} before={left} after={right} />
      ) : (
        <p className="field-help">Neither revision has a screenshot of {page}.</p>
      )}
    </div>
  )
}
