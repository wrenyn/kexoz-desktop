import { useState } from 'react'
import { toast } from 'react-hot-toast'
import type { NoteAction, PersistentTunnel, PreviewNote, PreviewReply, PreviewRevision } from '../../lib/api'
import { reproPromptForNote } from '../../lib/reproPrompt'
import { shareUrl } from '../../lib/shares'
import { afterShot, describeDevice, markerFor, noteBadges, revisionName, timeAgo } from '../../lib/review'
import { extractError } from '../../lib/utils'
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
  github: { ready: boolean; repo: string }
  linear: { ready: boolean; teamId: string }
  onAct: (action: NoteAction, options?: { revisionId?: string; comment?: string }) => Promise<boolean>
  onReply: (body: string) => Promise<boolean>
  onDeleteReply: (replyId: string) => void
  onDelete: () => void
  onCreateIssue: (provider: 'github' | 'linear') => void
  onLinkIssue: (url: string) => Promise<boolean>
  onCompare: () => void
  focused?: boolean
}

/** The owner tag would repeat an author already called Owner. */
const namedOwner = (author?: string) => (author ?? '').trim().toLowerCase() === 'owner'

export default function NoteThread(props: Props) {
  const { clientId, tunnel, note, number, color, revisions, busy, github, linear, onAct, onReply, onDeleteReply, onDelete, onCreateIssue, onLinkIssue, onCompare, focused } = props
  const [draft, setDraft] = useState('')
  const [fixedIn, setFixedIn] = useState('')
  const [linking, setLinking] = useState(false)
  const [issueInput, setIssueInput] = useState('')
  const replies = note.replies ?? []
  const leftOn = revisions.find(revision => revision.id === note.revisionId)
  const after = afterShot(note, revisions)
  const device = describeDevice(note.device)
  const pageUrl = `${shareUrl(tunnel)}${note.path.startsWith('/') ? note.path : `/${note.path}`}`
  const latest = revisions[revisions.length - 1]

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
    } catch (err) {
      toast.error(extractError(err))
    }
  }

  return (
    <article className={`ps-rv-note ${note.status}${focused ? ' focused' : ''}`} data-note-id={note.id}>
      <header className="ps-rv-note-head">
        <span className="ps-rv-note-number" style={{ background: color }} aria-hidden="true">{number}</span>
        <strong>{note.author || 'Guest'}</strong>
        {note.authorRole === 'owner' && !namedOwner(note.author) && <span className="ps-note-owner">Owner</span>}
        <span className="ps-rv-muted">{timeAgo(note.createdAt)}</span>
        <span className="ps-rv-badges">
          {noteBadges(note, revisions).map(badge => <span key={badge.label} className={`ps-badge ${badge.className}`}>{badge.label}</span>)}
        </span>
      </header>

      <p className="ps-rv-note-body">{note.body}</p>
      <p className="ps-rv-meta">
        <a href={pageUrl} target="_blank" rel="noreferrer">{note.path || '/'}</a>
        {note.target && <> · on {note.target}</>}
        {leftOn && <> · left on v{leftOn.number}</>}
      </p>
      {device && <p className="ps-rv-meta" title={note.device?.userAgent}>{device}</p>}

      {(note.snapshot || after) && (
        <div className="ps-rv-note-shots">
          {note.snapshot && (
            <button type="button" className="ps-rv-shot-btn" onClick={onCompare} aria-label={after ? 'Compare before and after' : 'Open the screenshot'}>
              <Snapshot clientId={clientId} shot={note.snapshot} marker={markerFor(note.snapshot, note)} color={color} frame={4 / 3} alt={`What ${note.author || 'the reviewer'} saw`} />
              <span className="ps-rv-shot-caption">{after ? 'Before' : 'What they saw'}</span>
            </button>
          )}
          {after && (
            <button type="button" className="ps-rv-shot-btn" onClick={onCompare} aria-label="Compare before and after">
              <Snapshot clientId={clientId} shot={after.shot} marker={markerFor(after.shot, note)} color={color} frame={4 / 3} alt={`After, in v${after.revision.number}`} />
              <span className="ps-rv-shot-caption">After · v{after.revision.number}</span>
            </button>
          )}
        </div>
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

      <textarea
        className="ps-input ps-rv-reply"
        placeholder={note.status === 'resolved' ? 'Reply, or say why you’re reopening it' : 'Reply to the reviewer'}
        value={draft}
        maxLength={2000}
        rows={2}
        aria-label={`Reply to note ${number}`}
        onChange={event => setDraft(event.target.value)}
        onKeyDown={event => { if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) { event.preventDefault(); void send() } }}
      />

      <div className="ps-rv-actions">
        <button type="button" className="ps-btn ps-btn-secondary ps-btn-sm" disabled={busy || !draft.trim()} onClick={() => void send()}>
          {busy ? 'Working…' : 'Reply'}
        </button>
        {note.status === 'open' && (
          <button type="button" className="ps-btn ps-btn-ghost ps-btn-sm" disabled={busy} onClick={() => void act('start')}>
            {busy ? 'Working…' : 'Start'}
          </button>
        )}
        {note.status === 'in_progress' && (
          <button type="button" className="ps-btn ps-btn-ghost ps-btn-sm" disabled={busy} onClick={() => void act('reopen')}>
            {busy ? 'Working…' : 'Put back'}
          </button>
        )}
        {note.status !== 'resolved' ? (
          <span className="ps-rv-fix">
            {revisions.length > 0 && (
              <select className="ps-select ps-rv-fix-select" value={fixedIn || latest?.id || ''} onChange={event => setFixedIn(event.target.value)} aria-label="Fixed in revision" disabled={busy}>
                {[...revisions].reverse().map(revision => <option key={revision.id} value={revision.id}>Fixed in {revisionName(revision)}</option>)}
              </select>
            )}
            <button type="button" className="ps-btn ps-btn-primary ps-btn-sm" disabled={busy} onClick={() => void act('resolve', { revisionId: fixedIn || latest?.id })}>
              {busy ? 'Working…' : 'Mark fixed'}
            </button>
          </span>
        ) : (
          <button type="button" className="ps-btn ps-btn-ghost ps-btn-sm" disabled={busy} onClick={() => void act('reopen')}>
            {busy ? 'Working…' : 'Reopen'}
          </button>
        )}
        <span className="ps-rv-actions-end">
          <button type="button" className="ps-btn ps-btn-ghost ps-btn-sm" disabled={busy} onClick={() => void copyForCursor()} title="Copy a paste-ready prompt for Cursor or Claude">Copy for Cursor</button>
          {note.issueUrl ? (
            <>
              <a className="ps-btn ps-btn-ghost ps-btn-sm" href={note.issueUrl} target="_blank" rel="noreferrer">View issue</a>
              <button type="button" className="ps-btn ps-btn-ghost ps-btn-sm" disabled={busy} onClick={() => void onLinkIssue('')}>Unlink</button>
            </>
          ) : (
            <>
              {github.ready && github.repo && (
                <button type="button" className="ps-btn ps-btn-ghost ps-btn-sm" disabled={busy} onClick={() => onCreateIssue('github')} title={`Open an issue in ${github.repo}`}>GitHub issue</button>
              )}
              {linear.ready && linear.teamId && (
                <button type="button" className="ps-btn ps-btn-ghost ps-btn-sm" disabled={busy} onClick={() => onCreateIssue('linear')} title="Open a Linear issue">Linear issue</button>
              )}
              {!github.repo && !linear.teamId && (
                <button type="button" className="ps-btn ps-btn-ghost ps-btn-sm" disabled={busy} onClick={() => setLinking(v => !v)}>Link issue</button>
              )}
            </>
          )}
          <button type="button" className="ps-btn ps-btn-ghost ps-btn-sm ps-btn-text-danger" disabled={busy} onClick={onDelete}>Delete</button>
        </span>
      </div>
      {linking && !note.issueUrl && (
        <form className="ps-rv-issue-form" onSubmit={async event => {
          event.preventDefault()
          if (await onLinkIssue(issueInput)) { setLinking(false); setIssueInput('') }
        }}>
          <input className="ps-input" type="url" placeholder="https://github.com/you/app/issues/12 or https://linear.app/…" value={issueInput} onChange={event => setIssueInput(event.target.value)} aria-label="Issue link" autoFocus />
          <button type="submit" className="ps-btn ps-btn-secondary ps-btn-sm" disabled={busy || !issueInput.trim()}>Link</button>
          <button type="button" className="ps-btn ps-btn-ghost ps-btn-sm" onClick={() => setLinking(false)}>Cancel</button>
        </form>
      )}
    </article>
  )
}
