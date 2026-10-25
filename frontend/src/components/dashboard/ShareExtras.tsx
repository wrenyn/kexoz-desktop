import { useCallback, useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { toast } from 'react-hot-toast'
import {
  createAccessLink, listAccessLinks, revokeAccessLink, updateTunnel,
  type AccessLink, type PersistentTunnel,
} from '../../lib/api'
import { shareUrl } from '../../lib/shares'
import { extractError } from '../../lib/utils'

export function PreviewSetting({ clientId, tunnel, onUpdated, onViewFeedback }: {
  clientId: string
  tunnel: PersistentTunnel
  onUpdated: (tunnel: PersistentTunnel) => void
  onViewFeedback: () => void
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
      {enabled && <button type="button" className="ps-btn ps-btn-ghost ps-btn-sm" onClick={onViewFeedback}>See feedback</button>}
    </div>
  )
}

const EXPIRIES = [
  { id: '1h', label: '1 hour', value: '1h' },
  { id: '24h', label: '1 day', value: '24h' },
  { id: '7d', label: '7 days', value: '168h' },
  { id: '30d', label: '30 days', value: '720h' },
  { id: 'never', label: 'Never', value: '' },
] as const

type ExpiryId = typeof EXPIRIES[number]['id']

const guestUrl = (tunnel: PersistentTunnel, link: AccessLink) => `${shareUrl(tunnel)}/?kexoz_access=${encodeURIComponent(link.token)}`

function linkSummary(link: AccessLink): string {
  const parts: string[] = []
  parts.push(link.maxUses > 0 ? `${link.uses} of ${link.maxUses} visits used` : `${link.uses} ${link.uses === 1 ? 'visit' : 'visits'}`)
  if (link.expiresAt) {
    const expires = new Date(link.expiresAt)
    parts.push(expires.getTime() < Date.now() ? 'Expired' : `Expires ${expires.toLocaleString()}`)
  } else {
    parts.push('No expiry')
  }
  return parts.join(' · ')
}

function QrDialog({ url, label, onClose }: { url: string; label: string; onClose: () => void }) {
  const [src, setSrc] = useState('')
  useEffect(() => {
    let cancelled = false
    void QRCode.toDataURL(url, { margin: 1, width: 240 }).then(data => { if (!cancelled) setSrc(data) })
    return () => { cancelled = true }
  }, [url])
  return (
    <div className="ps-modal-overlay" onClick={onClose} onKeyDown={event => { if (event.key === 'Escape') onClose() }}>
      <div className="ps-modal ps-qr-modal" role="dialog" aria-modal="true" aria-label="QR code" onClick={event => event.stopPropagation()}>
        <h2 className="ps-modal-title">{label || 'Guest link'}</h2>
        <p className="ps-ns-subtitle">Scan with a phone camera to open the share without the password.</p>
        {src ? <img className="ps-qr-image" src={src} alt="QR code for the guest link" width={240} height={240} /> : <div className="ps-qr-image" />}
        <button type="button" className="ps-btn ps-btn-secondary" onClick={onClose} autoFocus>Done</button>
      </div>
    </div>
  )
}

export function GuestLinks({ clientId, tunnel }: { clientId: string; tunnel: PersistentTunnel }) {
  const [links, setLinks] = useState<AccessLink[]>([])
  const [creating, setCreating] = useState(false)
  const [label, setLabel] = useState('')
  const [expiry, setExpiry] = useState<ExpiryId>('24h')
  const [maxUses, setMaxUses] = useState('')
  const [saving, setSaving] = useState(false)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [qr, setQr] = useState<AccessLink | null>(null)

  const refresh = useCallback(async () => {
    try {
      setLinks(await listAccessLinks(clientId, tunnel.id))
    } catch {
      setLinks([])
    }
  }, [clientId, tunnel.id])

  useEffect(() => { void refresh() }, [refresh])

  const usesNumber = Number(maxUses)
  const usesError = maxUses.trim() !== '' && (!Number.isInteger(usesNumber) || usesNumber < 1 || usesNumber > 10000)

  const copy = async (link: AccessLink) => {
    await navigator.clipboard.writeText(guestUrl(tunnel, link)).catch(() => {})
    setCopiedId(link.id)
    window.setTimeout(() => setCopiedId(current => current === link.id ? null : current), 1500)
  }

  const create = async () => {
    if (usesError || saving) return
    setSaving(true)
    try {
      const result = await createAccessLink(clientId, tunnel.id, {
        label: label.trim(),
        expiresIn: EXPIRIES.find(option => option.id === expiry)?.value || undefined,
        maxUses: maxUses.trim() ? usesNumber : 0,
      })
      setLinks(result.links)
      setCreating(false)
      setLabel('')
      setMaxUses('')
      await copy(result.link)
      toast.success('Guest link created and copied')
    } catch (err) {
      toast.error(extractError(err))
    } finally {
      setSaving(false)
    }
  }

  const revoke = async (link: AccessLink) => {
    try {
      setLinks(await revokeAccessLink(clientId, tunnel.id, link.id))
      toast.success('Link turned off. Anyone using it is signed out.')
    } catch (err) {
      toast.error(extractError(err))
    }
  }

  return (
    <div className="ps-share-extra">
      <div className="ps-share-extra-head">
        <div>
          <span className="ps-label">Guest links</span>
          <p className="ps-settings-row-desc">Let someone in without the password, for a set time or number of visits.</p>
        </div>
        {!creating && <button type="button" className="ps-btn ps-btn-secondary ps-btn-sm" onClick={() => setCreating(true)}>New guest link</button>}
      </div>

      {creating && (
        <div className="ps-guest-form">
          <input
            className="ps-input"
            placeholder="Who is it for? (optional)"
            aria-label="Label"
            value={label}
            maxLength={60}
            onChange={event => setLabel(event.target.value)}
            autoFocus
          />
          <label className="ps-guest-field">
            <span>Expires after</span>
            <select className="ps-feedback-select" value={expiry} onChange={event => setExpiry(event.target.value as ExpiryId)}>
              {EXPIRIES.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}
            </select>
          </label>
          <label className="ps-guest-field">
            <span>Visits</span>
            <input
              className="ps-input ps-input-mono ps-guest-uses"
              type="number"
              min={1}
              max={10000}
              placeholder="Unlimited"
              value={maxUses}
              onChange={event => setMaxUses(event.target.value)}
              aria-invalid={usesError}
            />
          </label>
          <div className="ps-guest-form-actions">
            <button type="button" className="ps-btn ps-btn-ghost ps-btn-sm" onClick={() => setCreating(false)}>Cancel</button>
            <button type="button" className="ps-btn ps-btn-primary ps-btn-sm" onClick={() => void create()} disabled={saving || usesError}>
              {saving ? 'Creating…' : 'Create and copy'}
            </button>
          </div>
          {usesError && <p className="ps-ns-error">Use a number from 1 to 10,000, or leave it empty.</p>}
        </div>
      )}

      {links.length > 0 && (
        <ul className="ps-guest-list">
          {links.map(link => (
            <li key={link.id}>
              <div className="ps-guest-info">
                <span className="ps-guest-label">{link.label || 'Guest link'}</span>
                <span className="ps-settings-row-desc">{linkSummary(link)}</span>
              </div>
              <button type="button" className="ps-btn ps-btn-ghost ps-btn-sm" onClick={() => void copy(link)}>{copiedId === link.id ? 'Copied' : 'Copy'}</button>
              <button type="button" className="ps-btn ps-btn-ghost ps-btn-sm" onClick={() => setQr(link)}>QR code</button>
              <button type="button" className="ps-btn ps-btn-ghost ps-btn-sm ps-btn-text-danger" onClick={() => void revoke(link)}>Turn off</button>
            </li>
          ))}
        </ul>
      )}

      {qr && <QrDialog url={guestUrl(tunnel, qr)} label={qr.label} onClose={() => setQr(null)} />}
    </div>
  )
}
