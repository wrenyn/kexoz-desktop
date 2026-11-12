import ModalOverlay from '../ui/ModalOverlay'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'react-hot-toast'
import { createReviewLink, listProjects, listWorkspaceMembers, reviewFeedbackUrl, reviewWorkspaceUrl, updateTunnel, type PersistentTunnel, type PreviewNote, type PreviewRevision } from '../../lib/api'
import { noteColors } from '../../lib/noteColors'
import { afterShot, approvalSummary, latestDecisions, revisionName, timeAgo } from '../../lib/review'
import { isGatedType, shareLabel, shareUrl } from '../../lib/shares'
import { extractError } from '../../lib/utils'
import { useConfirm } from '../../hooks/useConfirm'
import { useDialog } from '../../hooks/useDialog'
import { notesChanged } from '../../hooks/useOpenFeedback'
import { useReview } from '../../hooks/useReview'
import CompareView, { type CompareSide } from '../review/CompareView'
import CaptureInviteDialog from '../review/CaptureInviteDialog'
import GitHubModal from '../review/GitHubModal'
import LinearModal from '../review/LinearModal'
import NoteThread from '../review/NoteThread'
import RevisionModal from '../review/RevisionModal'
import Snapshot from '../review/Snapshot'
import {
  githubAvailable, githubStatus, repoForShare, setRepoForShare, type GitHubStatus,
} from '../../lib/github'
import {
  linearAvailable, linearStatus, listLinearTeams, setTeamForShare, teamForShare, type LinearStatus,
} from '../../lib/linear'
import LoadingBlock from '../ui/LoadingBlock'
import PremiumEmpty from '../ui/PremiumEmpty'
import LoadError from '../ui/LoadError'

type Tab = 'feedback' | 'versions' | 'compare'
type Filter = 'open' | 'in_progress' | 'resolved' | 'all'

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'open', label: 'Open' },
  { id: 'in_progress', label: 'In progress' },
  { id: 'resolved', label: 'Resolved' },
  { id: 'all', label: 'All' },
]

const noteStatusLabel = (status: string, verifiedAt?: string) => {
  if (verifiedAt || status === 'verified') return 'Confirmed'
  if (status === 'in_progress') return 'In progress'
  if (status === 'resolved') return 'Resolved'
  return 'Open'
}

const isDone = (note: PreviewNote) => note.status === 'resolved' || Boolean(note.verifiedAt) || String(note.status) === 'verified'

type Props = {
  clientId: string
  ownerEmail?: string
  tunnels: PersistentTunnel[]
  selectedId: string | null
  onSelect: (tunnelId: string) => void
  focusNoteId?: string | null
  onFocusNoteHandled?: () => void
  onTunnelUpdated?: (tunnel: PersistentTunnel) => void
  onOpenInboxNote?: (tunnelId: string, noteId: string) => void
  onNewShare: () => void
}

const ALL_SHARES = 'all'

export default function ReviewPage({ clientId, ownerEmail = '', tunnels, selectedId, onSelect, focusNoteId, onFocusNoteHandled, onTunnelUpdated, onOpenInboxNote, onNewShare }: Props) {
  const shares = useMemo(
    () => tunnels.filter(tunnel => isGatedType(tunnel.tunnelType) && tunnel.tunnelType !== 'mobile'),
    [tunnels],
  )
  const allMode = selectedId === ALL_SHARES
  const tunnel = allMode ? null : (shares.find(item => item.id === selectedId) ?? shares[0] ?? null)
  const review = useReview(clientId, allMode ? ALL_SHARES : tunnel?.id ?? null)
  const { notes, revisions, loaded, busyId } = review
  const { act: actOnNote, assign: assignNote } = review
  const { confirm, dialog } = useConfirm()
  const [tab, setTab] = useState<Tab>('feedback')
  const [filter, setFilter] = useState<Filter>('open')
  const [query, setQuery] = useState('')
  const [modal, setModal] = useState<{ kind: 'revision'; revision?: PreviewRevision } | null>(null)
  const [viewing, setViewing] = useState<PreviewNote | null>(null)
  const viewerRef = useDialog(() => setViewing(null), Boolean(viewing && (viewing.snapshot || afterShot(viewing, revisions))))
  const [opening, setOpening] = useState(false)
  const [inviteOpen, setInviteOpen] = useState(false)
  const [turningOn, setTurningOn] = useState(false)
  const [activeNoteId, setActiveNoteId] = useState<string | null>(null)
  const [projectId, setProjectId] = useState<string>('')
  const [ghStatus, setGhStatus] = useState<GitHubStatus>({ connected: false, login: '', encrypted: false })
  const [lnStatus, setLnStatus] = useState<LinearStatus>({ connected: false, name: '', encrypted: false })
  const [shareRepo, setShareRepo] = useState('')
  const [shareTeamId, setShareTeamId] = useState('')
  const [shareTeamLabel, setShareTeamLabel] = useState('')
  const [showGh, setShowGh] = useState(false)
  const [showLn, setShowLn] = useState(false)
  const [members, setMembers] = useState<string[]>([])
  const [mineOnly, setMineOnly] = useState(false)
  const myEmail = ownerEmail.trim().toLowerCase()

  useEffect(() => {
    if (!clientId || !tunnel?.id) { setProjectId(''); return }
    void listProjects(clientId).then(projects => {
      const match = projects.find(p => (p.tunnelIds || []).includes(tunnel.id))
      setProjectId(match?.id || '')
    }).catch(() => setProjectId(''))
  }, [clientId, tunnel?.id])

  useEffect(() => {
    if (githubAvailable()) void githubStatus().then(setGhStatus).catch(() => {})
    if (linearAvailable()) void linearStatus().then(setLnStatus).catch(() => {})
  }, [])

  useEffect(() => {
    if (!clientId) { setMembers([]); return }
    void listWorkspaceMembers(clientId).then(setMembers).catch(() => setMembers([]))
  }, [clientId])

  useEffect(() => {
    if (!tunnel?.id) {
      setShareRepo('')
      setShareTeamId('')
      return
    }
    setShareRepo(repoForShare(tunnel.id) || repoForShare('default'))
    setShareTeamId(teamForShare(tunnel.id) || teamForShare('default'))
  }, [tunnel?.id])

  useEffect(() => {
    if (!shareTeamId || !lnStatus.connected) {
      setShareTeamLabel('')
      return
    }
    let alive = true
    void listLinearTeams().then(teams => {
      if (!alive) return
      const match = teams.find(team => team.id === shareTeamId)
      setShareTeamLabel(match ? `${match.key}` : 'Team')
    }).catch(() => { if (alive) setShareTeamLabel('Team') })
    return () => { alive = false }
  }, [shareTeamId, lnStatus.connected])

  useEffect(() => {
    if (allMode && tab !== 'feedback') setTab('feedback')
    if (tab === 'compare' && revisions.length < 2) setTab('versions')
  }, [allMode, tab, revisions.length])

  useEffect(() => {
    if (!focusNoteId || !loaded) return
    const note = notes.find(item => item.id === focusNoteId)
    if (!note) {
      onFocusNoteHandled?.()
      return
    }
    setTab('feedback')
    setFilter(note.status === 'resolved' ? 'resolved' : note.status === 'in_progress' ? 'in_progress' : 'open')
    setActiveNoteId(focusNoteId)
    onFocusNoteHandled?.()
    requestAnimationFrame(() => {
      document.querySelector(`[data-note-id="${focusNoteId}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    })
  }, [focusNoteId, loaded, notes, onFocusNoteHandled])

  const colors = useMemo(() => noteColors(notes), [notes])
  const numbers = useMemo(() => {
    const order = [...notes].sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    return new Map(order.map((note, index) => [note.id, index + 1]))
  }, [notes])
  const scoped = useMemo(() => {
    if (!mineOnly || !myEmail) return notes
    return notes.filter(note => (note.assigneeEmail || '').toLowerCase() === myEmail)
  }, [notes, mineOnly, myEmail])
  const counts = useMemo(() => ({
    open: scoped.filter(note => note.status === 'open').length,
    in_progress: scoped.filter(note => note.status === 'in_progress').length,
    resolved: scoped.filter(note => isDone(note)).length,
    all: scoped.length,
  }), [scoped])
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    return scoped
      .filter(note => {
        if (filter === 'all') return true
        if (filter === 'resolved') return isDone(note)
        return note.status === filter
      })
      .filter(note => {
        if (!q) return true
        return [note.body, note.author, note.path, note.target, note.assigneeEmail]
          .filter(Boolean)
          .some(value => String(value).toLowerCase().includes(q))
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  }, [scoped, filter, query])

  useEffect(() => {
    if (tab !== 'feedback') return
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return
      const target = event.target as HTMLElement | null
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable)) return
      const ids = shown.map(item => item.id)
      if (!ids.length) return
      const index = activeNoteId ? ids.indexOf(activeNoteId) : -1
      if (event.key === 'j' || event.key === 'n') {
        event.preventDefault()
        const next = ids[Math.min(ids.length - 1, index < 0 ? 0 : index + 1)]
        setActiveNoteId(next)
        document.querySelector(`[data-note-id="${next}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
      } else if (event.key === 'k' || event.key === 'p') {
        event.preventDefault()
        const prev = ids[Math.max(0, index < 0 ? 0 : index - 1)]
        setActiveNoteId(prev)
        document.querySelector(`[data-note-id="${prev}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
      } else if (event.key === 'Enter' && allMode && activeNoteId) {
        const note = shown.find(item => item.id === activeNoteId)
        if (note) {
          event.preventDefault()
          onOpenInboxNote?.(note.tunnelId, note.id)
        }
      } else if ((event.key === 's' || event.key === 'f' || event.key === 'r' || event.key === 'a' || event.key === 'u') && activeNoteId) {
        const note = shown.find(item => item.id === activeNoteId)
        if (!note) return
        event.preventDefault()
        const act = async (action: 'start' | 'resolve' | 'reopen') => {
          const ok = await actOnNote(note, action)
          if (!ok) return
          if (action === 'start') setFilter('in_progress')
          else if (action === 'resolve') setFilter('resolved')
          else setFilter('open')
        }
        if (event.key === 's' && note.status === 'open') void act('start')
        if (event.key === 'f' && !isDone(note)) void act('resolve')
        if (event.key === 'r' && note.status !== 'open') void act('reopen')
        if (event.key === 'a' && myEmail) void assignNote(note, myEmail)
        if (event.key === 'u') void assignNote(note, '')
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [tab, shown, activeNoteId, allMode, onOpenInboxNote, actOnNote, assignNote, myEmail])

  const shareName = (tunnelId: string) => {
    const match = shares.find(item => item.id === tunnelId)
    return match ? shareLabel(match) : 'Share'
  }

  const turnOnNotes = async () => {
    if (!tunnel || turningOn) return
    setTurningOn(true)
    try {
      onTunnelUpdated?.(await updateTunnel(clientId, { ...tunnel, preview: true }))
      toast.success('Notes on')
    } catch (err) {
      toast.error(extractError(err))
    } finally {
      setTurningOn(false)
    }
  }

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

  const removeNote = async (note: PreviewNote) => {
    const ok = await confirm({ title: 'Delete this feedback?', message: 'This removes the note and its conversation. This can’t be undone.', confirmLabel: 'Delete feedback', tone: 'danger' })
    if (ok) await review.removeNote(note)
  }

  const removeRevision = async (revision: PreviewRevision) => {
    const ok = await confirm({
      title: `Delete ${revisionName(revision)}?`,
      message: 'This version will be removed from the review history. This can’t be undone.',
      confirmLabel: 'Delete', tone: 'danger',
    })
    if (ok) await review.removeRevision(revision)
  }

  const closeModal = useCallback(() => setModal(null), [])

  if (!allMode && !tunnel) {
    return (
      <div className="ps-main">
        <div className="ps-page-header animate-fade-down">
          <div>
            <h1 className="ps-page-title">Feedback</h1>
          </div>
        </div>
        <div className="ps-page-content animate-fade-up">
          <div className="ps-card">
            <PremiumEmpty title="Make room for feedback" action={<button type="button" className="ps-btn ps-btn-primary" onClick={onNewShare}>Create a web share</button>}>Share a local web app to collect screenshots, bug reports, and comments here.</PremiumEmpty>
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
          <h1 className="ps-page-title">Feedback</h1>
          <p className="ps-page-subtitle">Track reported issues, discuss fixes, and share new versions.</p>
        </div>
        <div className="ps-rv-header-actions">
          <select className="ps-select" value={allMode ? ALL_SHARES : tunnel?.id ?? ''} onChange={event => onSelect(event.target.value)} aria-label="Share">
            <option value={ALL_SHARES}>All shares</option>
            {shares.map(item => (
              <option key={item.id} value={item.id}>{shareLabel(item)}</option>
            ))}
          </select>
          {!allMode && (
            <button type="button" className="ps-btn ps-btn-primary ps-btn-sm" onClick={() => setModal({ kind: 'revision' })}>New version</button>
          )}
          <details className="ps-header-more">
            <summary className="ps-btn ps-btn-ghost ps-btn-sm">More</summary>
            <div className="ps-header-more-menu" role="menu">
              {!allMode && (
                <>
                  <button type="button" role="menuitem" onClick={() => void openAsOwner()} disabled={opening || !tunnel?.preview}>
                    {opening ? 'Opening…' : 'Open as owner'}
                  </button>
                  <button type="button" role="menuitem" onClick={() => setInviteOpen(true)}>
                    Capture invite…
                  </button>
                </>
              )}
              <a role="menuitem" href={reviewWorkspaceUrl(clientId, projectId || undefined)} target="_blank" rel="noreferrer">
                Team board
              </a>
            </div>
          </details>
        </div>
      </div>

      <div className="ps-page-content animate-fade-up">
        {review.error && <LoadError message={review.error} onRetry={() => void review.refresh()} />}
        {!allMode && tunnel && !tunnel.preview && (
          <div className="ps-card ps-rv-callout">
            Feedback is turned off for this share.{' '}
            <button type="button" className="ps-btn ps-btn-secondary ps-btn-sm" onClick={() => void turnOnNotes()} disabled={turningOn}>
              {turningOn ? 'Turning on…' : 'Turn on'}
            </button>
          </div>
        )}

        <div className="ps-rv-toolbar">
          <div className="ps-rv-tabs" role="tablist" aria-label="Feedback views" onKeyDown={event => {
            const tabs = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]'))
            const index = tabs.indexOf(document.activeElement as HTMLButtonElement)
            const next = event.key === 'ArrowRight' ? (index + 1) % tabs.length : event.key === 'ArrowLeft' ? (index - 1 + tabs.length) % tabs.length : event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : -1
            if (next >= 0) { event.preventDefault(); tabs[next].focus(); tabs[next].click() }
          }}>
            {([
              ['feedback', `Notes${counts.open + counts.in_progress ? ` · ${counts.open + counts.in_progress}` : ''}`],
              ...(!allMode ? [['versions', `Versions${revisions.length ? ` · ${revisions.length}` : ''}`] as const] : []),
              ...(!allMode && revisions.length >= 2 ? [['compare', 'Compare'] as const] : []),
            ] as const).map(([id, label]) => (
              <button key={id} type="button" role="tab" tabIndex={tab === id ? 0 : -1} aria-selected={tab === id} className={`ps-tab ${tab === id ? 'active' : ''}`} onClick={() => setTab(id)}>{label}</button>
            ))}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginLeft: 'auto' }}>
            {!allMode && githubAvailable() && (
              <button
                type="button"
                className="ps-btn ps-btn-ghost ps-btn-sm"
                title={shareRepo || 'Choose GitHub repository'}
                onClick={() => setShowGh(true)}
              >
                {shareRepo || (ghStatus.connected ? 'GitHub repo…' : 'GitHub')}
              </button>
            )}
            {!allMode && linearAvailable() && (
              <button
                type="button"
                className="ps-btn ps-btn-ghost ps-btn-sm"
                title={shareTeamLabel || 'Choose Linear team'}
                onClick={() => setShowLn(true)}
              >
                {shareTeamLabel || (lnStatus.connected ? 'Linear team…' : 'Linear')}
              </button>
            )}
            {tab === 'feedback' && (
              <input
                className="ps-input ps-rv-search"
                value={query}
                onChange={event => setQuery(event.target.value)}
                placeholder="Search"
                aria-label="Search feedback"
              />
            )}
            {tab === 'feedback' && (
              <details className="ps-header-more">
                <summary className="ps-btn ps-btn-ghost ps-btn-sm">Shortcuts</summary>
                <div className="ps-header-more-menu ps-shortcut-menu">
                  <div className="ps-shortcut-row"><span>Next / previous note</span><kbd>J / K</kbd></div>
                  <div className="ps-shortcut-row"><span>Start working</span><kbd>S</kbd></div>
                  <div className="ps-shortcut-row"><span>Mark fixed</span><kbd>F</kbd></div>
                  <div className="ps-shortcut-row"><span>Reopen</span><kbd>R</kbd></div>
                  <div className="ps-shortcut-row"><span>Assign to me</span><kbd>A</kbd></div>
                  <div className="ps-shortcut-row"><span>Unassign</span><kbd>U</kbd></div>
                </div>
              </details>
            )}
          </div>
        </div>

        {tab === 'feedback' && (
          <>
            <div className="ps-rv-filter-row">
            <div className="ps-segmented ps-rv-filter" role="radiogroup" aria-label="Show">
              {FILTERS.map(option => (
                <button key={option.id} type="button" role="radio" aria-checked={filter === option.id} className={`ps-segmented-item ${filter === option.id ? 'active' : ''}`} onClick={() => setFilter(option.id)}>
                  {option.label} <span className="ps-rv-count">{counts[option.id]}</span>
                </button>
              ))}
            </div>
            <label className="ps-rv-mine">
              <input type="checkbox" checked={mineOnly} onChange={event => setMineOnly(event.target.checked)} disabled={!myEmail} />
              Assigned to me
            </label>
            </div>
            {!loaded ? (
              <div className="ps-card"><LoadingBlock label="Loading feedback" rows={4} /></div>
            ) : shown.length === 0 && review.error ? null : shown.length === 0 ? (
              <div className="ps-card">
                <PremiumEmpty
                  title={query.trim() || mineOnly ? 'No matching feedback' : filter === 'all' ? 'No feedback yet' : `No ${filter === 'in_progress' ? 'feedback in progress' : filter === 'resolved' ? 'resolved feedback' : 'open feedback'}`}
                  action={tunnel ? (
                    <button type="button" className="ps-btn ps-btn-secondary ps-btn-sm" onClick={() => void navigator.clipboard.writeText(shareUrl(tunnel))}>
                      Copy link
                    </button>
                  ) : undefined}
                >{query.trim() || mineOnly ? 'Try another search or turn off “Assigned to me”.' : 'Feedback left on your shared app appears here. Use the share link to invite someone to review.'}</PremiumEmpty>
              </div>
            ) : allMode ? (
              <div className="ps-rv-notes">
                {shown.map(note => (
                  <div
                    key={note.id}
                    className={`ps-card ps-rv-inbox-row ${activeNoteId === note.id ? 'focused' : ''}`}
                    data-note-id={note.id}
                    onClick={() => setActiveNoteId(note.id)}
                  >
                    <span className="ps-rv-muted">{shareName(note.tunnelId)} · {noteStatusLabel(note.status, note.verifiedAt)}</span>
                    <button
                      type="button"
                      className="ps-rv-inbox-open"
                      onClick={event => {
                        event.stopPropagation()
                        onOpenInboxNote?.(note.tunnelId, note.id)
                      }}
                    >
                      {(note.title || note.body || 'Note').split('\n')[0].slice(0, 90)}
                    </button>
                    <span className="ps-rv-muted">{note.author || 'Guest'} · {timeAgo(note.createdAt)}</span>
                    <div className="ps-rv-inbox-actions" onClick={event => event.stopPropagation()}>
                    <select
                      className="ps-select ps-rv-fix-select"
                      value={note.assigneeEmail || ''}
                      aria-label="Assignee"
                      onChange={event => {
                        void review.assign(note, event.target.value)
                      }}
                    >
                      <option value="">Unassigned</option>
                      {members.map(email => (
                        <option key={email} value={email}>{email}</option>
                      ))}
                      {note.assigneeEmail && !members.includes(note.assigneeEmail.toLowerCase()) && (
                        <option value={note.assigneeEmail}>{note.assigneeEmail}</option>
                      )}
                    </select>
                    {note.status === 'open' && (
                      <button type="button" className="ps-btn ps-btn-ghost ps-btn-sm" disabled={busyId === note.id} onClick={() => void review.act(note, 'start').then(ok => { if (ok) setFilter('in_progress') })}>
                        Start
                      </button>
                    )}
                    {!isDone(note) && (
                      <button type="button" className="ps-btn ps-btn-ghost ps-btn-sm" disabled={busyId === note.id} onClick={() => void review.act(note, 'resolve').then(ok => { if (ok) setFilter('resolved') })}>
                        Mark fixed
                      </button>
                    )}
                    {note.status !== 'open' && (
                      <button type="button" className="ps-btn ps-btn-ghost ps-btn-sm" disabled={busyId === note.id} onClick={() => void review.act(note, 'reopen').then(ok => { if (ok) setFilter('open') })}>
                        Reopen
                      </button>
                    )}
                    </div>
                  </div>
                ))}
              </div>
            ) : tunnel ? (
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
                    focused={activeNoteId === note.id}
                    onAct={async (action, options) => {
                      const ok = await review.act(note, action, options)
                      if (ok) {
                        if (action === 'start') setFilter('in_progress')
                        else if (action === 'resolve') setFilter('resolved')
                        else if (action === 'reopen') setFilter('open')
                      }
                      return ok
                    }}
                    onReply={body => review.reply(note, body)}
                    onDeleteReply={replyId => void review.removeReply(note, replyId)}
                    onDelete={() => void removeNote(note)}
                    onLinkIssue={url => review.linkIssue(note, url)}
                    onAssign={email => review.assign(note, email)}
                    members={members}
                    onCompare={() => setViewing(note)}
                    webDetailUrl={projectId ? reviewFeedbackUrl(clientId, projectId, note.id) : undefined}
                  />
                ))}
              </div>
            ) : null}
          </>
        )}

        {tab === 'versions' && (
          !loaded
            ? <div className="ps-card"><LoadingBlock label="Loading versions" rows={3} /></div>
            : (
              <RevisionList
                clientId={clientId}
                notes={notes}
                revisions={revisions}
                busyId={busyId}
                onCreate={() => setModal({ kind: 'revision' })}
                onEdit={revision => setModal({ kind: 'revision', revision })}
                onDelete={revision => void removeRevision(revision)}
              />
            )
        )}

        {tab === 'compare' && (
          !loaded
            ? <div className="ps-card"><LoadingBlock label="Loading compare" rows={3} /></div>
            : <ComparePanel clientId={clientId} revisions={revisions} />
        )}
      </div>

      {modal?.kind === 'revision' && tunnel && (
        <RevisionModal
          clientId={clientId}
          tunnel={tunnel}
          notes={notes}
          revision={modal.revision}
          onClose={closeModal}
          onSaved={() => { void review.refresh(); notesChanged() }}
        />
      )}
      {viewing && (viewingBefore || viewingAfter) && (
        <ModalOverlay onMouseDown={event => { if (event.target === event.currentTarget) setViewing(null) }}>
          <div ref={viewerRef} tabIndex={-1} className="ps-modal ps-rv-modal viewer" role="dialog" aria-modal="true" aria-label="Screenshots">
            <div className="ps-modal-header">
              <h2 className="ps-modal-title">Screenshots</h2>
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
        </ModalOverlay>
      )}
      {inviteOpen && tunnel && (
        <CaptureInviteDialog clientId={clientId} tunnel={tunnel} onClose={() => setInviteOpen(false)} />
      )}
      {showGh && tunnel && (
        <GitHubModal
          status={ghStatus}
          repo={shareRepo}
          shareName={shareLabel(tunnel)}
          onStatus={setGhStatus}
          onRepo={repo => {
            setRepoForShare(tunnel.id, repo)
            setShareRepo(repo)
          }}
          onClose={() => setShowGh(false)}
        />
      )}
      {showLn && tunnel && (
        <LinearModal
          status={lnStatus}
          teamId={shareTeamId}
          shareName={shareLabel(tunnel)}
          onStatus={setLnStatus}
          onTeam={teamId => {
            setTeamForShare(tunnel.id, teamId)
            setShareTeamId(teamId)
          }}
          onClose={() => setShowLn(false)}
        />
      )}
      {dialog}
    </div>
  )
}

function RevisionList({ clientId, notes, revisions, busyId, onCreate, onEdit, onDelete }: {
  clientId: string
  notes: PreviewNote[]
  revisions: PreviewRevision[]
  busyId: string | null
  onCreate: () => void
  onEdit: (revision: PreviewRevision) => void
  onDelete: (revision: PreviewRevision) => void
}) {
  const [expanded, setExpanded] = useState<string | null>(null)

  if (revisions.length === 0) {
    return (
      <div className="ps-card">
        <PremiumEmpty
          title="No versions"
          action={<button type="button" className="ps-btn ps-btn-primary ps-btn-sm" onClick={onCreate}>New version</button>}
        />
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
              {revision.fixed} fixed{confirmed ? ` · ${confirmed} confirmed` : ''}
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
                  {latestDecisions(revision).map(item => `${item.author} ${item.decision === 'approved' ? 'approved' : 'changes'}`).join(' · ')}
                  {' '}{open ? '▲' : '▼'}
                </button>
                {open && (
                  <ol className="ps-rv-history">
                    {[...revision.approvals].reverse().map(item => (
                      <li key={item.id}>
                        <span className={item.decision === 'approved' ? 'ps-rv-ok' : 'ps-rv-no'}>{item.decision === 'approved' ? 'Approved' : 'Changes'}</span>
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
        <PremiumEmpty title="Nothing to compare" />
      </div>
    )
  }

  const left = before?.id === after?.id ? undefined : pick(before)
  const right = pick(after)

  const single = captured.length === 1

  return (
    <div className="ps-card ps-rv-compare-card">
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
        <p className="ps-empty-title">No screenshot</p>
      )}
    </div>
  )
}
