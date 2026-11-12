import { useEffect, useState } from 'react'
import { toast } from 'react-hot-toast'
import {
  ROOT_DOMAIN, SHARE_LIMITS, TIER_LABELS, fetchClientProfile, tierOf, updateClientProfile, upgradeUrl,
  type ClientSession,
} from '../../lib/api'
import { extractError } from '../../lib/utils'
import Spinner from '../ui/Spinner'
import { useRef } from 'react'

type Props = {
  session: ClientSession
  shareCount?: number
  onVerify: () => void
  verifying: boolean
  gauthEnabled: boolean
  onSignOut: () => void
}

export default function AccountPage({
  session, shareCount = 0, onVerify, verifying, gauthEnabled, onSignOut,
}: Props) {
  const tier = tierOf(session)
  const limit = SHARE_LIMITS[tier]
  const pct = Math.min(100, (shareCount / limit) * 100)
  const meterTone = pct >= 100 ? 'full' : pct >= 80 ? 'high' : ''
  const [displayName, setDisplayName] = useState(session.displayName || '')
  const [avatarUrl, setAvatarUrl] = useState(session.avatarUrl || '')
  const [draftName, setDraftName] = useState(session.displayName || '')
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [photoBusy, setPhotoBusy] = useState(false)
  const photoInput = useRef<HTMLInputElement>(null)

  useEffect(() => {
    let alive = true
    fetchClientProfile(session.id).then(profile => {
      if (!alive) return
      setDisplayName(profile.displayName || '')
      setAvatarUrl(profile.avatarUrl || '')
      setDraftName(profile.displayName || '')
    }).catch(() => {})
    return () => { alive = false }
  }, [session.id])

  const saveName = async () => {
    const name = draftName.trim()
    if (!name) {
      toast.error('Enter a name.')
      return
    }
    setSaving(true)
    try {
      const next = await updateClientProfile(session.id, { displayName: name, avatarUrl })
      setDisplayName(next.displayName || name)
      setAvatarUrl(next.avatarUrl || avatarUrl)
      setEditing(false)
      toast.success('Name updated')
    } catch (err) {
      toast.error(extractError(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="ps-main">
      <div className="ps-page-header animate-fade-down">
        <div>
          <h1 className="ps-page-title">Account</h1>
          <p className="ps-page-subtitle">Your profile, plan, and billing.</p>
        </div>
      </div>

      <div className="ps-page-content">
        <div className="ps-settings-page animate-fade-up">
          <section className="ps-card ps-settings-section">
            <div className="ps-settings-section-title">Profile</div>
            {session.ownerEmail ? (
              <>
                <div className="ps-settings-row">
                  <div className="ps-settings-row-info" style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                    {avatarUrl ? (
                      <img src={avatarUrl} alt="" width={36} height={36} style={{ borderRadius: '50%', objectFit: 'cover' }} />
                    ) : (
                      <div style={{
                        width: 36, height: 36, borderRadius: '50%', background: 'var(--bg-elevated)',
                        display: 'grid', placeItems: 'center', fontWeight: 700,
                      }}>
                        {(displayName || session.ownerEmail)[0]?.toUpperCase()}
                      </div>
                    )}
                    <div>
                      <div className="ps-settings-row-label">{displayName || 'Add your name'}</div>
                      <div className="ps-settings-row-desc">{session.ownerEmail}</div>
                    </div>
                  </div>
                  <div className="ps-settings-row-actions">
                    <button type="button" className="ps-btn ps-btn-secondary ps-btn-sm" disabled={photoBusy || saving} onClick={() => photoInput.current?.click()}>
                      {photoBusy ? 'Uploading…' : 'Change photo'}
                    </button>
                      <input
                        ref={photoInput}
                        type="file"
                        accept="image/*"
                        hidden
                        disabled={photoBusy}
                        onChange={async event => {
                          const file = event.target.files?.[0]
                          event.target.value = ''
                          if (!file) return
                          if (file.size > 280_000) {
                            toast.error('Choose an image smaller than 280 KB.')
                            return
                          }
                          setPhotoBusy(true)
                          try {
                            const dataUrl = await new Promise<string>((resolve, reject) => {
                              const reader = new FileReader()
                              reader.onload = () => resolve(String(reader.result || ''))
                              reader.onerror = () => reject(reader.error || new Error('read failed'))
                              reader.readAsDataURL(file)
                            })
                            const name = (displayName || session.ownerEmail.split('@')[0] || 'Owner').trim()
                            const next = await updateClientProfile(session.id, { displayName: name, avatarUrl: dataUrl })
                            setDisplayName(next.displayName || name)
                            setAvatarUrl(next.avatarUrl || dataUrl)
                            toast.success('Photo updated')
                          } catch (err) {
                            toast.error(extractError(err))
                          } finally {
                            setPhotoBusy(false)
                          }
                        }}
                      />
                    <button type="button" className="ps-btn ps-btn-secondary ps-btn-sm" disabled={saving || photoBusy} onClick={() => { setDraftName(displayName); setEditing(v => !v) }}>
                      {editing ? 'Close' : 'Edit name'}
                    </button>
                    <button type="button" className="ps-btn ps-btn-text-danger ps-btn-sm" onClick={onSignOut}>
                      Sign out
                    </button>
                  </div>
                </div>
                {editing && (
                  <div className="ps-settings-row" style={{ gap: 8 }}>
                    <input
                      className="ps-input"
                      value={draftName}
                      onChange={event => setDraftName(event.target.value)}
                      maxLength={80}
                      placeholder="Your name"
                      aria-label="Display name"
                      autoFocus
                      disabled={saving || photoBusy}
                      onKeyDown={event => {
                        if (event.key === 'Enter' && !saving && !photoBusy) void saveName()
                        if (event.key === 'Escape' && !saving) setEditing(false)
                      }}
                      style={{ flex: 1, minWidth: 160 }}
                    />
                    <button type="button" className="ps-btn ps-btn-primary ps-btn-sm" disabled={saving || photoBusy || !draftName.trim() || draftName.trim() === displayName} onClick={() => void saveName()}>
                      {saving ? 'Saving…' : 'Save'}
                    </button>
                  </div>
                )}
              </>
            ) : (
              <div className="ps-settings-row">
                <div className="ps-settings-row-info">
                  <div className="ps-settings-row-label">Guest</div>
                  <div className="ps-settings-row-desc">Sign in to add your profile and invite teammates to this workspace.</div>
                </div>
                {gauthEnabled && (
                  <button
                    type="button"
                    className={`ps-btn ps-btn-primary ps-btn-sm ${verifying ? 'is-loading' : ''}`}
                    onClick={onVerify}
                    disabled={verifying}
                  >
                    {verifying ? <><Spinner size={13} /> Waiting</> : 'Continue with Google'}
                  </button>
                )}
              </div>
            )}
          </section>

          <section className="ps-card ps-settings-section">
            <div className="ps-settings-section-title">Plan</div>
            <div className="ps-settings-row">
              <div className="ps-settings-row-info">
                <div className="ps-settings-row-label">{TIER_LABELS[tier]}</div>
                <div className="ps-settings-row-desc">{shareCount} of {limit} shares</div>
                <div className="ps-usage-bar ps-account-usage" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
                  <div className={meterTone} style={{ width: `${pct}%` }} />
                </div>
              </div>
              <div className="ps-settings-row-actions">
                {tier !== 'pro_plus' && (
                  <a
                    className="ps-btn ps-btn-primary ps-btn-sm"
                    href={upgradeUrl(session.id, tier === 'pro' ? 'pro_plus' : 'pro')}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Upgrade
                  </a>
                )}
                <a
                  className="ps-btn ps-btn-secondary ps-btn-sm"
                  href={`https://${ROOT_DOMAIN}/account?clientId=${encodeURIComponent(session.id)}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  Billing
                </a>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
