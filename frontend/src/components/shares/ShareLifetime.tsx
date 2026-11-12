import { useEffect, useState } from 'react'
import { toast } from 'react-hot-toast'
import {
  createAccessLink, listAccessLinks, listAccessSessions, revokeAccessLink, revokeAccessSession, setShareExpiry, signEveryoneOut,
  type AccessLink, type AccessSession, type PersistentTunnel,
} from '../../lib/api'
import { shareUrl } from '../../lib/shares'
import { extractError } from '../../lib/utils'
import { useCopy } from '../../hooks/useCopy'
import LoadingBlock from '../ui/LoadingBlock'

const KEEP_OPTIONS = [
  { duration: '1h', label: '1 hour' },
  { duration: '24h', label: '24 hours' },
  { duration: '168h', label: '7 days' },
  { duration: '720h', label: '30 days' },
  { duration: '', label: 'Never stop' },
]

/** Restarts or removes a share's automatic stop. */
export function ExpiryEditor({ clientId, tunnel, onUpdated }: { clientId: string; tunnel: PersistentTunnel; onUpdated: (tunnel: PersistentTunnel) => void }) {
  const [choice, setChoice] = useState(tunnel.expiresAt ? '24h' : '')
  const [saving, setSaving] = useState(false)
  const [open, setOpen] = useState(false)

  const save = async () => {
    setSaving(true)
    try {
      const updated = await setShareExpiry(clientId, tunnel, choice)
      onUpdated(updated)
      setOpen(false)
      toast.success(updated.expiresAt ? `Stops on ${new Date(updated.expiresAt).toLocaleString()}` : 'This share no longer stops on its own')
    } catch (err) {
      toast.error(extractError(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="ps-lifetime">
      <span className="ps-panel-hint">
        {tunnel.expiresAt ? `Stops ${new Date(tunnel.expiresAt).toLocaleString()}` : 'Until you stop it'}
      </span>
      {open ? (
        <span className="ps-lifetime-edit">
          <select className="ps-select" value={choice} onChange={event => setChoice(event.target.value)} aria-label="Keep it running for">
            {KEEP_OPTIONS.map(option => <option key={option.label} value={option.duration}>{option.duration ? `${option.label} from now` : option.label}</option>)}
          </select>
          <button type="button" className="ps-btn ps-btn-primary ps-btn-sm" disabled={saving} onClick={() => void save()}>Save</button>
          <button type="button" className="ps-btn ps-btn-ghost ps-btn-sm" onClick={() => setOpen(false)}>Cancel</button>
        </span>
      ) : (
        <button type="button" className="ps-rename-btn" onClick={() => setOpen(true)}>{tunnel.expiresAt ? 'Change' : 'Set stop'}</button>
      )}
    </div>
  )
}

const LINK_EXPIRY = [
  { value: '24h', label: '1 day' },
  { value: '168h', label: '7 days' },
  { value: '720h', label: '30 days' },
  { value: '', label: 'No expiry' },
]

const linkUrl = (tunnel: PersistentTunnel, link: AccessLink) => `${shareUrl(tunnel)}/?kexoz_access=${encodeURIComponent(link.token)}`

function linkState(link: AccessLink): string {
  if (link.expiresAt && new Date(link.expiresAt).getTime() <= Date.now()) return 'Expired'
  if (link.maxUses > 0 && link.uses >= link.maxUses) return 'Used up'
  const uses = link.maxUses > 0 ? `${link.uses} of ${link.maxUses} uses` : `${link.uses} ${link.uses === 1 ? 'use' : 'uses'}`
  const people = link.emails?.length ? ` · only ${link.emails.join(', ')}` : ''
  return (link.expiresAt ? `${uses} · until ${new Date(link.expiresAt).toLocaleDateString()}` : uses) + people
}

/** Splits what the owner typed into addresses or @domain entries. */
const parseEmails = (value: string): string[] =>
  value.split(/[\s,;]+/).map(item => item.trim().toLowerCase()).filter(Boolean)

const emailEntryOk = (entry: string) => /^@[a-z0-9.-]+\.[a-z]{2,}$/.test(entry) || /^[^@\s]+@[a-z0-9.-]+\.[a-z]{2,}$/.test(entry)

/** Guest links let someone into a private share without the password. */
export function AccessLinks({ clientId, tunnel }: { clientId: string; tunnel: PersistentTunnel }) {
  const [links, setLinks] = useState<AccessLink[] | null>(null)
  const [adding, setAdding] = useState(false)
  const [label, setLabel] = useState('')
  const [expiresIn, setExpiresIn] = useState('168h')
  const [maxUses, setMaxUses] = useState('')
  const [emails, setEmails] = useState('')
  const [busy, setBusy] = useState(false)
  const { copied, copy } = useCopy()

  useEffect(() => {
    let alive = true
    const load = () => listAccessLinks(clientId, tunnel.id).then(list => { if (alive) setLinks(list) }).catch(() => { if (alive) setLinks(current => current ?? []) })
    void load()
    const timer = window.setInterval(() => { if (!document.hidden) void load() }, 30000)
    return () => { alive = false; window.clearInterval(timer) }
  }, [clientId, tunnel.id])

  const uses = maxUses.trim() === '' ? 0 : Number(maxUses)
  const usesOk = maxUses.trim() === '' || (Number.isInteger(uses) && uses >= 1 && uses <= 10000)
  const people = parseEmails(emails)
  const emailsOk = people.length <= 50 && people.every(emailEntryOk)

  const create = async () => {
    setBusy(true)
    try {
      const result = await createAccessLink(clientId, tunnel.id, { label: label.trim(), expiresIn, maxUses: uses, emails: people.length ? people : undefined })
      setLinks(result.links)
      setAdding(false)
      setLabel('')
      setMaxUses('')
      setEmails('')
      await copy(result.link.id, linkUrl(tunnel, result.link))
      toast.success('Link copied')
    } catch (err) {
      toast.error(extractError(err))
    } finally {
      setBusy(false)
    }
  }

  const revoke = async (link: AccessLink) => {
    setBusy(true)
    try {
      await revokeAccessLink(clientId, tunnel.id, link.id)
      setLinks(current => (current ?? []).filter(item => item.id !== link.id))
    } catch (err) {
      toast.error(extractError(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="ps-guest-links">
      {links && links.length > 0 && (
        <ul className="ps-guest-list">
          {links.map(link => (
            <li key={link.id}>
              <span className="ps-guest-text">
                <strong>{link.label || 'Guest link'}</strong>
                <span className="ps-panel-hint">{linkState(link)}</span>
              </span>
              <button type="button" className="ps-btn ps-btn-ghost ps-btn-sm" onClick={() => void copy(link.id, linkUrl(tunnel, link))}>{copied === link.id ? 'Copied' : 'Copy'}</button>
              <button type="button" className="ps-btn ps-btn-ghost ps-btn-sm ps-btn-text-danger" disabled={busy} onClick={() => void revoke(link)}>Revoke</button>
            </li>
          ))}
        </ul>
      )}
      {adding ? (
        <form className="ps-guest-form" onSubmit={event => { event.preventDefault(); if (usesOk && emailsOk) void create() }}>
          <input className="ps-input" placeholder="Label" maxLength={60} value={label} onChange={event => setLabel(event.target.value)} aria-label="Link label" autoFocus />
          <select className="ps-select" value={expiresIn} onChange={event => setExpiresIn(event.target.value)} aria-label="Link expiry">
            {LINK_EXPIRY.map(option => <option key={option.label} value={option.value}>{option.label}</option>)}
          </select>
          <input className="ps-input ps-guest-uses" type="number" min={1} max={10000} placeholder="Max uses" value={maxUses} onChange={event => setMaxUses(event.target.value)} aria-label="Maximum uses" aria-invalid={!usesOk} />
          <input
            className="ps-input ps-guest-emails"
            placeholder="Emails (optional)"
            value={emails}
            onChange={event => setEmails(event.target.value)}
            aria-label="People allowed to use the link"
            aria-invalid={!emailsOk}
          />
          <button type="submit" className="ps-btn ps-btn-primary ps-btn-sm" disabled={busy || !usesOk || !emailsOk}>Create</button>
          <button type="button" className="ps-btn ps-btn-ghost ps-btn-sm" onClick={() => setAdding(false)}>Cancel</button>
        </form>
      ) : (
        <button type="button" className="ps-panel-disclosure" onClick={() => setAdding(true)}>
          {links && links.length > 0 ? 'Add link' : 'Guest link'}
        </button>
      )}
    </div>
  )
}

const VIA_LABELS: Record<AccessSession['via'], string> = { password: 'Password', link: 'Guest link', email: 'Email code' }

function ago(value: string): string {
  const minutes = Math.round((Date.now() - new Date(value).getTime()) / 60000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.round(minutes / 60)
  if (hours < 48) return `${hours} h ago`
  return `${Math.round(hours / 24)} days ago`
}

/** Who is signed in to a private share, with a way to sign anyone out at once. */
export function GuestSessions({ clientId, tunnel }: { clientId: string; tunnel: PersistentTunnel }) {
  const [sessions, setSessions] = useState<AccessSession[] | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let alive = true
    const load = () => listAccessSessions(clientId, tunnel.id).then(list => { if (alive) setSessions(list) }).catch(() => { if (alive) setSessions(current => current ?? []) })
    void load()
    const timer = window.setInterval(load, 30000)
    return () => { alive = false; window.clearInterval(timer) }
  }, [clientId, tunnel.id])

  const revoke = async (session: AccessSession) => {
    setBusy(true)
    try {
      setSessions(await revokeAccessSession(clientId, tunnel.id, session.id))
      toast.success('Signed out')
    } catch (err) {
      toast.error(extractError(err))
    } finally {
      setBusy(false)
    }
  }

  const revokeAll = async () => {
    setBusy(true)
    try {
      const count = await signEveryoneOut(clientId, tunnel.id)
      setSessions([])
      toast.success(count > 0 ? `Signed out ${count} ${count === 1 ? 'visitor' : 'visitors'}` : 'Everyone is signed out')
    } catch (err) {
      toast.error(extractError(err))
    } finally {
      setBusy(false)
    }
  }

  if (sessions !== null && sessions.length === 0) return null

  return (
    <div className="ps-guest-sessions">
      <div className="ps-guest-sessions-head">
        <span className="ps-panel-kicker">Signed in</span>
        {sessions && sessions.length > 0 && (
          <button type="button" className="ps-btn ps-btn-ghost ps-btn-sm ps-btn-text-danger" disabled={busy} onClick={() => void revokeAll()}>
            Sign out all
          </button>
        )}
      </div>
      {sessions === null ? (
        <LoadingBlock label="Loading" compact rows={2} />
      ) : (
        <ul className="ps-guest-list">
          {sessions.map(session => (
            <li key={session.id}>
              <span className="ps-guest-text">
                <strong>{session.email || session.linkLabel || VIA_LABELS[session.via]}</strong>
                <span className="ps-panel-hint">
                  {[VIA_LABELS[session.via], `seen ${ago(session.lastSeenAt)}`].filter(Boolean).join(' · ')}
                </span>
              </span>
              <button type="button" className="ps-btn ps-btn-ghost ps-btn-sm ps-btn-text-danger" disabled={busy} onClick={() => void revoke(session)}>Sign out</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
