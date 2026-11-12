import { useEffect, useMemo, useRef, useState } from 'react'
import ModalOverlay from '../ui/ModalOverlay'
import { useDialog } from '../../hooks/useDialog'
import { toast } from 'react-hot-toast'
import type {
  FeedbackAttachment, FeedbackDetail, FeedbackTimelineEvent,
  NoteAction, PersistentTunnel, PreviewNote, PreviewReply, PreviewRevision,
} from '../../lib/api'
import {
  attachmentObjectUrl, createFeedbackShareLink, getFeedbackDetail, revokeFeedbackShareLink, reviewWorkspaceUrl,
} from '../../lib/api'
import { reproPromptForNote } from '../../lib/reproPrompt'
import { shareUrl } from '../../lib/shares'
import { afterShot, describeDevice, markerFor, noteBadges, revisionName, timeAgo } from '../../lib/review'
import { extractError } from '../../lib/utils'
import { createIssueForNote, repoForShare } from '../../lib/github'
import { createLinearIssueForNote, linearAvailable, linearStatus, teamForShare } from '../../lib/linear'
import Snapshot from './Snapshot'

const EVENTS: Partial<Record<PreviewReply['kind'], (reply: PreviewReply, revisions: PreviewRevision[]) => string>> = {
  started: () => 'started working on this',
  stopped: () => 'put this back in the queue',
  resolved: (reply, revisions) => {
    const revision = revisions.find(item => item.id === reply.revisionId)
    return revision ? `marked this fixed in ${revisionName(revision)}` : 'marked this fixed'
  },
  reopened: () => 'reopened this',
  verified: () => 'confirmed the fix',
}

type Props = {
  clientId: string
  tunnel: PersistentTunnel
  note: PreviewNote
  number: number
  color: string
  revisions: PreviewRevision[]
  busy: boolean
  onAct: (action: NoteAction, options?: { revisionId?: string; comment?: string }) => Promise<boolean>
  onReply: (body: string) => Promise<boolean>
  onDeleteReply: (replyId: string) => void
  onDelete: () => void
  onLinkIssue: (url: string) => Promise<boolean>
  onAssign?: (email: string) => Promise<boolean>
  members?: string[]
  onCompare: () => void
  focused?: boolean
  webDetailUrl?: string
}

const namedOwner = (author?: string) => (author ?? '').trim().toLowerCase() === 'owner'

const displayBody = (body: string) => {
  const idx = body.indexOf('\n\nSteps:\n')
  return idx >= 0 ? body.slice(0, idx).trim() : body
}

const eventLabel = (event: FeedbackTimelineEvent): string => {
  const payload = event.payload || {}
  const type = event.type || ''
  if (type === 'navigation') return `Opened ${String(payload.url || '').slice(0, 120)}`
  if (type === 'click') return `Clicked ${String(payload.text || payload.selector || payload.tag || 'element').slice(0, 80)}`
  if (type === 'console_error' || type === 'exception' || type === 'rejection') {
    return `Error: ${String(payload.message || '').slice(0, 140)}`
  }
  if (type === 'console_warn') return `Warn: ${String(payload.message || '').slice(0, 140)}`
  if (type === 'network_error' || type === 'network_http') {
    return `${String(payload.method || 'GET')} ${String(payload.url || '').slice(0, 100)} → ${payload.status ?? 'error'}`
  }
  if (type === 'form') return `Filled ${String(payload.name || payload.selector || 'field')}`
  return type
}

function useAttachmentSrc(clientId: string, attachmentId: string) {
  const [src, setSrc] = useState('')
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    let alive = true
    attachmentObjectUrl(clientId, attachmentId)
      .then(url => { if (alive) setSrc(url) })
      .catch(() => { if (alive) setFailed(true) })
    return () => { alive = false }
  }, [clientId, attachmentId])
  return { src, failed }
}

function isVideoAttachment(attachment: FeedbackAttachment) {
  return attachment.kind === 'video' || attachment.kind === 'session_recording' || (attachment.mimeType || '').startsWith('video/')
}

function CaptureThumb({
  clientId, attachment, alt, onOpen,
}: {
  clientId: string
  attachment: FeedbackAttachment
  alt: string
  onOpen: (src: string, video: boolean) => void
}) {
  const { src, failed } = useAttachmentSrc(clientId, attachment.id)
  const video = isVideoAttachment(attachment)
  if (failed) return <span className="ps-rv-capture-miss">Unavailable</span>
  if (!src) return <div className="ps-rv-capture-thumb skeleton" aria-hidden="true" />
  return (
    <button
      type="button"
      className="ps-rv-capture-thumb"
      onClick={() => onOpen(src, video)}
      aria-label={video ? `Play ${alt}` : `Open ${alt}`}
    >
      {video ? <video src={src} muted playsInline preload="metadata" /> : <img src={src} alt="" />}
      {video && <span className="ps-rv-capture-play" aria-hidden="true">▶</span>}
    </button>
  )
}

export default function NoteThread(props: Props) {
  const {
    clientId, tunnel, note, number, color, revisions, busy,
    onAct, onReply, onDeleteReply, onDelete, onLinkIssue, onAssign, members = [], onCompare, focused, webDetailUrl,
  } = props
  const [draft, setDraft] = useState('')
  const [fixedIn, setFixedIn] = useState('')
  const [linking, setLinking] = useState(false)
  const [issueInput, setIssueInput] = useState('')
  const [creatingIssue, setCreatingIssue] = useState<'github' | 'linear' | null>(null)
  const [moreOpen, setMoreOpen] = useState(false)
  const [captureOpen, setCaptureOpen] = useState(Boolean(focused) || note.source === 'capture')
  const [detail, setDetail] = useState<FeedbackDetail | null>(null)
  const [detailState, setDetailState] = useState<'idle' | 'loading' | 'ready' | 'empty' | 'error'>('idle')
  const [lightbox, setLightbox] = useState<{ src: string; video: boolean; alt: string } | null>(null)
  const lightboxRef = useDialog(() => setLightbox(null), Boolean(lightbox))
  const loadedFor = useRef<string | null>(null)
  const replies = note.replies ?? []
  const leftOn = revisions.find(revision => revision.id === note.revisionId)
  const after = afterShot(note, revisions)
  const device = describeDevice(note.device)
  const pageUrl = `${shareUrl(tunnel)}${note.path.startsWith('/') ? note.path : `/${note.path}`}`
  const latest = revisions[revisions.length - 1]
  const badges = noteBadges(note, revisions)
  const statusBadge = badges.find(badge => badge.label !== 'Capture' && badge.label !== 'Preview') ?? badges[0]
  const sourceBadge = badges.find(badge => badge.label === 'Capture' || badge.label === 'Preview')
  const wantsCapture = captureOpen || Boolean(focused)

  useEffect(() => {
    loadedFor.current = null
    setDetail(null)
    setDetailState('idle')
    setLightbox(null)
    setCaptureOpen(Boolean(focused) || note.source === 'capture')
  }, [note.id]) // eslint-disable-line react-hooks/exhaustive-deps -- reset only when switching notes

  useEffect(() => {
    if (focused || note.source === 'capture') setCaptureOpen(true)
  }, [focused, note.source])

  useEffect(() => {
    if (!wantsCapture) return
    if (loadedFor.current === note.id) return
    let alive = true
    setDetailState('loading')
    getFeedbackDetail(clientId, note.id)
      .then(next => {
        if (!alive) return
        loadedFor.current = note.id
        setDetail(next)
        const has =
          (next.attachments?.length ?? 0) > 0 ||
          (next.steps?.length ?? 0) > 0 ||
          (next.timeline?.length ?? 0) > 0 ||
          Boolean(next.recording?.attachmentId)
        setDetailState(has ? 'ready' : 'empty')
      })
      .catch(() => {
        if (!alive) return
        setDetail(null)
        setDetailState('error')
      })
    return () => { alive = false }
  }, [wantsCapture, clientId, note.id])

  const images = useMemo(
    () => (detail?.attachments || []).filter(item => (item.kind || 'image') === 'image' || (item.mimeType || '').startsWith('image/')),
    [detail],
  )
  const videos = useMemo(
    () => (detail?.attachments || []).filter(item => item.kind === 'video' || item.kind === 'session_recording' || (item.mimeType || '').startsWith('video/')),
    [detail],
  )
  const errors = useMemo(
    () => (detail?.timeline || []).filter(event => ['console_error', 'exception', 'rejection', 'network_error', 'network_http'].includes(event.type || '')),
    [detail],
  )
  const steps = detail?.steps ?? []
  const hasCapture = images.length > 0 || videos.length > 0 || Boolean(detail?.recording?.attachmentId) || steps.length > 0 || errors.length > 0

  const createGithub = async () => {
    if (creatingIssue) return
    setCreatingIssue('github')
    try {
      const repo = repoForShare(tunnel.id) || repoForShare('default')
      const url = await createIssueForNote(repo, tunnel, note, clientId)
      if (await onLinkIssue(url)) {
        toast.success('GitHub issue created')
        setMoreOpen(false)
      }
    } catch (err) {
      toast.error(extractError(err) || 'Connect GitHub in Settings → Integrations.')
    } finally {
      setCreatingIssue(null)
    }
  }

  const createLinear = async () => {
    if (creatingIssue) return
    setCreatingIssue('linear')
    try {
      if (!linearAvailable()) throw new Error('Linear works in the desktop app.')
      const status = await linearStatus()
      if (!status.connected) throw new Error('Connect Linear in Settings → Integrations.')
      const teamId = teamForShare(tunnel.id) || teamForShare('default')
      if (!teamId) throw new Error('Pick a Linear team in Settings → Integrations.')
      const url = await createLinearIssueForNote(teamId, tunnel, note)
      if (await onLinkIssue(url)) {
        toast.success('Linear issue created')
        setMoreOpen(false)
      }
    } catch (err) {
      toast.error(extractError(err))
    } finally {
      setCreatingIssue(null)
    }
  }

  const send = async () => {
    const text = draft.trim()
    if (text && await onReply(text)) setDraft('')
  }

  const act = async (action: NoteAction, options: { revisionId?: string } = {}) => {
    if (await onAct(action, { ...options, comment: draft.trim() })) setDraft('')
  }

  const copyForCursor = async () => {
    try {
      await navigator.clipboard.writeText(reproPromptForNote(tunnel, note))
      toast.success('Copied for Cursor')
      setMoreOpen(false)
    } catch (err) {
      toast.error(extractError(err))
    }
  }

  const copyShareLink = async () => {
    try {
      const { url } = await createFeedbackShareLink(clientId, note.id)
      await navigator.clipboard.writeText(url)
      toast.success('Link copied')
    } catch (err) {
      toast.error(extractError(err))
    }
  }

  const openShareThread = async () => {
    try {
      const { url } = await createFeedbackShareLink(clientId, note.id)
      window.open(url, '_blank', 'noopener')
    } catch (err) {
      toast.error(extractError(err))
    }
  }

  const revokeShareLink = async () => {
    try {
      await revokeFeedbackShareLink(clientId, note.id)
      toast.success('Share link revoked')
      setMoreOpen(false)
    } catch (err) {
      toast.error(extractError(err))
    }
  }

  return (
    <article className={`ps-rv-note ${note.status}${focused ? ' focused' : ''}`} data-note-id={note.id}>
      <header className="ps-rv-note-head">
        <span className="ps-rv-note-number" style={{ background: color }} aria-hidden="true">{number}</span>
        <div className="ps-rv-note-who">
          <strong>{note.author || 'Guest'}</strong>
          {note.authorRole === 'owner' && !namedOwner(note.author) && <span className="ps-note-owner">Owner</span>}
          <span className="ps-rv-muted">{timeAgo(note.createdAt)}</span>
        </div>
        {sourceBadge && (
          <span className={`ps-source-label ${sourceBadge.label === 'Preview' ? 'muted' : ''}`}>
            {sourceBadge.label === 'Capture' ? 'CAPTURE' : 'PREVIEW'}
          </span>
        )}
        {statusBadge && <span className={`ps-badge ${statusBadge.className}`}>{statusBadge.label}</span>}
      </header>

      <p className="ps-rv-note-body">{displayBody(note.body)}</p>

      <p className="ps-rv-meta" title={device || undefined}>
        {detail?.sourceUrl ? (
          <a href={detail.sourceUrl} target="_blank" rel="noreferrer">{detail.sourceUrl}</a>
        ) : (
          <a href={pageUrl} target="_blank" rel="noreferrer">{note.path || '/'}</a>
        )}
        {note.target ? <> · {note.target}</> : null}
        {leftOn ? <> · v{leftOn.number}</> : null}
      </p>
      {onAssign && (
        <label className="ps-rv-assign">
          <span className="ps-rv-muted">Assign</span>
          <select
            className="ps-select ps-rv-fix-select"
            value={note.assigneeEmail || ''}
            disabled={busy}
            aria-label="Assignee"
            onChange={event => void onAssign(event.target.value)}
          >
            <option value="">Unassigned</option>
            {members.map(email => (
              <option key={email} value={email}>{email}</option>
            ))}
            {note.assigneeEmail && !members.includes(note.assigneeEmail.toLowerCase()) && (
              <option value={note.assigneeEmail}>{note.assigneeEmail}</option>
            )}
          </select>
        </label>
      )}

      {(note.snapshot || after) && (
        <div className="ps-rv-note-shots">
          {note.snapshot && (
            <button type="button" className="ps-rv-shot-btn" onClick={onCompare} aria-label={after ? 'Compare before and after' : 'Open the screenshot'}>
              <Snapshot clientId={clientId} shot={note.snapshot} marker={markerFor(note.snapshot, note)} color={color} frame={16 / 10} alt={`What ${note.author || 'the reviewer'} saw`} />
              <span className="ps-rv-shot-caption">{after ? 'Before' : 'Screenshot'}</span>
            </button>
          )}
          {after && (
            <button type="button" className="ps-rv-shot-btn" onClick={onCompare} aria-label="Compare before and after">
              <Snapshot clientId={clientId} shot={after.shot} marker={markerFor(after.shot, note)} color={color} frame={16 / 10} alt={`After, in v${after.revision.number}`} />
              <span className="ps-rv-shot-caption">After · v{after.revision.number}</span>
            </button>
          )}
        </div>
      )}

      {note.source !== 'capture' && (
        <div className="ps-rv-capture-toggle">
          <button
            type="button"
            className="ps-btn ps-btn-ghost ps-btn-sm"
            aria-expanded={wantsCapture}
            onClick={() => setCaptureOpen(v => !v)}
          >
            {wantsCapture ? 'Hide capture' : 'Show capture'}
          </button>
        </div>
      )}

      {wantsCapture && (
        <div className="ps-rv-capture">
          {detailState === 'loading' && (
            <div className="ps-rv-capture-strip" aria-busy="true">
              <div className="ps-rv-capture-thumb skeleton" />
              <div className="ps-rv-capture-thumb skeleton" />
            </div>
          )}
          {detailState === 'error' && <p className="ps-rv-capture-miss">Couldn’t load capture details.</p>}
          {detailState === 'empty' && (
            <p className="ps-rv-capture-miss">
              {note.source === 'capture'
                ? 'This Capture report has no attached media yet.'
                : 'No recording, screenshot, or steps on this note.'}
            </p>
          )}
          {detailState === 'ready' && detail?.summary && (
            <p className="ps-rv-capture-summary">{detail.summary}</p>
          )}
          {detailState === 'ready' && hasCapture && (
            <>
              {(images.length > 0 || videos.length > 0 || detail?.recording?.attachmentId) && (
                <div className="ps-rv-capture-strip">
                  {images.map(image => (
                    <CaptureThumb
                      key={image.id}
                      clientId={clientId}
                      attachment={image}
                      alt={image.fileName || 'Screenshot'}
                      onOpen={(src, video) => setLightbox({ src, video, alt: image.fileName || 'Screenshot' })}
                    />
                  ))}
                  {detail?.recording?.attachmentId ? (
                    <CaptureThumb
                      clientId={clientId}
                      attachment={{ id: detail.recording.attachmentId, kind: 'session_recording', mimeType: 'video/webm' }}
                      alt="Session recording"
                      onOpen={(src, video) => setLightbox({ src, video, alt: 'Session recording' })}
                    />
                  ) : videos.map(video => (
                    <CaptureThumb
                      key={video.id}
                      clientId={clientId}
                      attachment={video}
                      alt={video.fileName || 'Recording'}
                      onOpen={(src, isVideo) => setLightbox({ src, video: isVideo, alt: video.fileName || 'Recording' })}
                    />
                  ))}
                </div>
              )}
              {steps.length > 0 && (
                <section className="ps-rv-capture-section">
                  <h3>Steps</h3>
                  <ol>
                    {steps.map((step, index) => (
                      <li key={`${index}-${step}`}>{step}</li>
                    ))}
                  </ol>
                </section>
              )}
              {errors.length > 0 && (
                <section className="ps-rv-capture-section">
                  <h3>Errors & network</h3>
                  <ul className="ps-rv-capture-errors">
                    {errors.slice(0, 20).map((event, index) => (
                      <li key={event.id || index}>{eventLabel(event)}</li>
                    ))}
                  </ul>
                </section>
              )}
            </>
          )}
        </div>
      )}

      {lightbox && (
        <ModalOverlay className="ps-rv-capture-lightbox" onMouseDown={event => { if (event.target === event.currentTarget) setLightbox(null) }}>
          <div ref={lightboxRef} tabIndex={-1} className="ps-rv-capture-lightbox-frame" role="dialog" aria-modal="true" aria-label={lightbox.alt}>
            <button type="button" className="ps-btn ps-btn-ghost ps-btn-sm" onClick={() => setLightbox(null)}>Close</button>
            {lightbox.video
              ? <video src={lightbox.src} controls autoPlay />
              : <img src={lightbox.src} alt={lightbox.alt} />}
          </div>
        </ModalOverlay>
      )}

      {replies.length > 0 && (
        <ol className="ps-rv-thread">
          {replies.map(reply => {
            const event = EVENTS[reply.kind]
            return (
              <li key={reply.id} className={reply.kind === 'comment' ? '' : 'event'}>
                <span className="ps-rv-reply-head">
                  <strong>{reply.author || 'Guest'}</strong>
                  {reply.authorRole === 'owner' && !namedOwner(reply.author) && <span className="ps-note-owner">Owner</span>}
                  <span className="ps-rv-muted">{timeAgo(reply.createdAt)}</span>
                  {reply.kind === 'comment' && (
                    <button type="button" className="ps-rv-link" onClick={() => onDeleteReply(reply.id)} disabled={busy}>Delete</button>
                  )}
                </span>
                {event && <span className="ps-rv-event">{event(reply, revisions)}</span>}
                {reply.body && <p>{reply.body}</p>}
              </li>
            )
          })}
        </ol>
      )}

      <div className="ps-rv-compose">
        <textarea
          className="ps-input ps-rv-reply"
          placeholder={note.status === 'resolved' ? 'Reply, or say why you’re reopening it' : 'Reply…'}
          value={draft}
          maxLength={2000}
          rows={2}
          aria-label={`Reply to note ${number}`}
          onChange={event => setDraft(event.target.value)}
          onKeyDown={event => { if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) { event.preventDefault(); void send() } }}
        />
        <div className="ps-rv-actions">
          <button type="button" className="ps-btn ps-btn-secondary ps-btn-sm" disabled={busy || !draft.trim()} onClick={() => void send()}>
            Reply
          </button>
          {note.status === 'open' && (
            <button type="button" className="ps-btn ps-btn-ghost ps-btn-sm" disabled={busy} onClick={() => void act('start')}>
              Start
            </button>
          )}
          {note.status === 'in_progress' && (
            <button type="button" className="ps-btn ps-btn-ghost ps-btn-sm" disabled={busy} onClick={() => void act('reopen')}>
              Back to open
            </button>
          )}
          {note.status !== 'resolved' ? (
            <span className="ps-rv-fix">
              {revisions.length > 0 && (
                <select className="ps-select ps-rv-fix-select" value={fixedIn || latest?.id || ''} onChange={event => setFixedIn(event.target.value)} aria-label="Fixed in revision" disabled={busy}>
                  {[...revisions].reverse().map(revision => <option key={revision.id} value={revision.id}>{revisionName(revision)}</option>)}
                </select>
              )}
              <button type="button" className="ps-btn ps-btn-primary ps-btn-sm" disabled={busy} onClick={() => void act('resolve', { revisionId: fixedIn || latest?.id })}>
                Mark fixed
              </button>
            </span>
          ) : (
            <button type="button" className="ps-btn ps-btn-ghost ps-btn-sm" disabled={busy} onClick={() => void act('reopen')}>
              Reopen
            </button>
          )}
          <div className="ps-rv-actions-end">
            {!note.issueUrl && (
              <button type="button" className="ps-btn ps-btn-ghost ps-btn-sm" disabled={busy || creatingIssue !== null} onClick={() => void createGithub()}>
                {creatingIssue === 'github' ? 'Creating…' : 'GitHub issue'}
              </button>
            )}
            <button type="button" className="ps-btn ps-btn-ghost ps-btn-sm" disabled={busy} onClick={() => void openShareThread()}>
              Open /f
            </button>
            <button type="button" className="ps-btn ps-btn-ghost ps-btn-sm" disabled={busy} onClick={() => void copyShareLink()}>
              Copy link
            </button>
            <button type="button" className="ps-btn ps-btn-ghost ps-btn-sm" onClick={() => setMoreOpen(v => !v)} aria-expanded={moreOpen}>
              More
            </button>
          </div>
        </div>
      </div>

      {moreOpen && (
        <div className="ps-rv-more">
          <a className="ps-btn ps-btn-ghost ps-btn-sm" href={webDetailUrl || reviewWorkspaceUrl(clientId)} target="_blank" rel="noreferrer">
            Open on web
          </a>
          <button type="button" className="ps-btn ps-btn-ghost ps-btn-sm" disabled={busy} onClick={() => void copyForCursor()}>
            Copy for Cursor
          </button>
          <button type="button" className="ps-btn ps-btn-ghost ps-btn-sm" disabled={busy} onClick={() => void revokeShareLink()}>
            Revoke share link
          </button>
          {note.issueUrl ? (
            <>
              <a className="ps-btn ps-btn-ghost ps-btn-sm" href={note.issueUrl} target="_blank" rel="noreferrer">View issue</a>
              <button type="button" className="ps-btn ps-btn-ghost ps-btn-sm" disabled={busy} onClick={() => void onLinkIssue('')}>Unlink</button>
            </>
          ) : (
            <>
              <button type="button" className="ps-btn ps-btn-ghost ps-btn-sm" disabled={busy || creatingIssue !== null} onClick={() => void createGithub()}>
                {creatingIssue === 'github' ? 'Creating…' : 'Create GitHub issue'}
              </button>
              <button type="button" className="ps-btn ps-btn-ghost ps-btn-sm" disabled={busy || creatingIssue !== null} onClick={() => void createLinear()}>
                {creatingIssue === 'linear' ? 'Creating…' : 'Create Linear issue'}
              </button>
              <button type="button" className="ps-btn ps-btn-ghost ps-btn-sm" disabled={busy} onClick={() => setLinking(v => !v)}>
                Link issue URL
              </button>
            </>
          )}
          <button type="button" className="ps-btn ps-btn-ghost ps-btn-sm ps-btn-text-danger" disabled={busy} onClick={onDelete}>
            Delete
          </button>
        </div>
      )}

      {linking && !note.issueUrl && (
        <form className="ps-rv-issue-form" onSubmit={async event => {
          event.preventDefault()
          if (await onLinkIssue(issueInput)) { setLinking(false); setIssueInput(''); setMoreOpen(false) }
        }}>
          <input className="ps-input" type="url" placeholder="https://…/issues/12" value={issueInput} onChange={event => setIssueInput(event.target.value)} aria-label="Issue link" autoFocus />
          <button type="submit" className="ps-btn ps-btn-secondary ps-btn-sm" disabled={busy || !issueInput.trim()}>Link</button>
          <button type="button" className="ps-btn ps-btn-ghost ps-btn-sm" onClick={() => setLinking(false)}>Cancel</button>
        </form>
      )}
    </article>
  )
}
