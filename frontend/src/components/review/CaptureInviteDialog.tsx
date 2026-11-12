import ModalOverlay from '../ui/ModalOverlay'
import { useCallback, useEffect, useState } from 'react'
import { toast } from 'react-hot-toast'
import { captureInstall, createCaptureInvite, listCaptureInvites, revokeCaptureInvite, type CaptureInvite, type PersistentTunnel } from '../../lib/api'
import { useDialog } from '../../hooks/useDialog'
import { extractError } from '../../lib/utils'

type Props = {
  clientId: string
  tunnel: PersistentTunnel
  onClose: () => void
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

export default function CaptureInviteDialog({ clientId, tunnel, onClose }: Props) {
  const dialogRef = useDialog(onClose)
  const [days, setDays] = useState<1 | 7 | 14>(14)
  const [inviting, setInviting] = useState(false)
  const [invites, setInvites] = useState<CaptureInvite[]>([])
  const [loading, setLoading] = useState(true)
  const [revoking, setRevoking] = useState<string | null>(null)
  const [storeUrl, setStoreUrl] = useState('')

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      setInvites(await listCaptureInvites(clientId, tunnel.id))
    } catch {
      setInvites([])
    } finally {
      setLoading(false)
    }
  }, [clientId, tunnel.id])

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    void captureInstall().then(info => setStoreUrl(info.storeUrl)).catch(() => setStoreUrl(''))
  }, [])

  const mint = async () => {
    setInviting(true)
    try {
      const { token, days: ttl, url } = await createCaptureInvite(clientId, tunnel.id, { days })
      const inviteUrl = url || token
      await navigator.clipboard.writeText([
        `You're invited to capture bugs on “${tunnel.name || tunnel.subdomain || 'this share'}” with Kexoz Capture.`,
        `Expires in ${ttl} day${ttl === 1 ? '' : 's'}.`,
        '',
        storeUrl ? `1. Add Capture: ${storeUrl}` : '1. Install Kexoz Capture (Chrome extension).',
        `2. Open this invite: ${inviteUrl}`,
        'If Capture is already installed, that page signs you into the share.',
        '',
        `Token (popup → I have an invite): ${token}`,
      ].join('\n'))
      toast.success(`Invite copied (${ttl}d)`)
      await refresh()
    } catch (err) {
      toast.error(extractError(err))
    } finally {
      setInviting(false)
    }
  }

  const revoke = async (invite: CaptureInvite) => {
    setRevoking(invite.id)
    try {
      await revokeCaptureInvite(clientId, tunnel.id, invite.id)
      toast.success('Invite revoked')
      await refresh()
    } catch (err) {
      toast.error(extractError(err))
    } finally {
      setRevoking(null)
    }
  }

  const active = invites.filter(item => item.status === 'active')

  return (
    <ModalOverlay onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}>
      <div className="ps-modal ps-rv-modal" ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="capture-invite-title" tabIndex={-1}>
        <header className="ps-modal-header">
          <h2 id="capture-invite-title" className="ps-modal-title">Capture invite</h2>
          <button type="button" className="ps-btn ps-btn-ghost ps-btn-sm" onClick={onClose}>Close</button>
        </header>
        <div className="ps-modal-body">
          <p className="ps-modal-sub">
            Copy the invite link. Guests with Capture installed are signed into {tunnel.name || tunnel.subdomain || 'this share'} automatically. They never see your Client ID.
          </p>
          <div className="ps-capture-invite-mint">
            <label className="ps-label" htmlFor="invite-days">Expires</label>
            <div className="ps-capture-invite-mint-row">
              <select
                id="invite-days"
                className="ps-select"
                value={days}
                onChange={event => setDays(Number(event.target.value) as 1 | 7 | 14)}
              >
                <option value={1}>1 day</option>
                <option value={7}>7 days</option>
                <option value={14}>14 days</option>
              </select>
              <button type="button" className="ps-btn ps-btn-primary ps-btn-sm" disabled={inviting} onClick={() => void mint()}>
                {inviting ? 'Creating…' : 'Create & copy'}
              </button>
            </div>
          </div>
          <div className="ps-capture-invites">
            <span className="ps-label">Active & recent</span>
            {loading ? (
              <p className="ps-settings-row-desc">Loading…</p>
            ) : invites.length === 0 ? (
              <p className="ps-settings-row-desc">No invites yet.</p>
            ) : (
              <ul className="ps-capture-invite-list">
                {invites.map(invite => (
                  <li key={invite.id}>
                    <div>
                      <code>{invite.tokenHint}</code>
                      <span className={`ps-badge ${invite.status === 'active' ? 'ps-badge-mint' : ''}`}>{invite.status}</span>
                      <span className="ps-rv-muted"> · {timeAgo(invite.createdAt)}</span>
                      {invite.lastUsedAt ? <span className="ps-rv-muted"> · used {timeAgo(invite.lastUsedAt)}</span> : null}
                    </div>
                    {invite.status === 'active' && (
                      <button
                        type="button"
                        className="ps-btn ps-btn-ghost ps-btn-sm ps-btn-text-danger"
                        disabled={revoking === invite.id}
                        onClick={() => void revoke(invite)}
                      >
                        {revoking === invite.id ? 'Revoking…' : 'Revoke'}
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {active.length > 0 && (
              <p className="ps-settings-row-desc">{active.length} active · revoke leaked tokens immediately</p>
            )}
          </div>
        </div>
      </div>
    </ModalOverlay>
  )
}
