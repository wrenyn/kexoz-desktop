import { useEffect, useState } from 'react'
import { toast } from 'react-hot-toast'
import {
  ROOT_DOMAIN, inviteTeamMember, listSharedWorkspaces, listTeam, revokeTeamMember, tierOf, upgradeUrl,
  type ClientSession, type SharedWorkspace, type TeamMember,
} from '../../lib/api'
import { extractError } from '../../lib/utils'

type Props = {
  session: ClientSession
  onVerify: () => void
  verifying: boolean
  gauthEnabled: boolean
  onSignOut: () => void
}

const TIER_LABEL: Record<string, string> = {
  anonymous: 'Guest',
  verified:  'Free',
  pro:       'Pro',
  pro_plus:  'Pro+',
}

export default function SettingsPage({
  session, onVerify,
  verifying, gauthEnabled, onSignOut,
}: Props) {
  const tier = tierOf(session)

  return (
    <div className="ps-main">
      <div className="ps-page-header animate-fade-down">
        <div>
          <h1 className="ps-page-title">Settings</h1>
          <p className="ps-page-subtitle">Account and who can join this workspace</p>
        </div>
      </div>

      <div className="ps-page-content">
        <div className="ps-settings-page animate-fade-up">

          <section className="ps-card ps-settings-section">
            <div className="ps-settings-section-title">Account</div>

            <div className="ps-settings-row">
              <div className="ps-settings-row-info">
                <div className="ps-settings-row-label">Plan</div>
                <div className="ps-settings-row-desc">Change plans or redeem a promotional code on the web</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span className="ps-badge ps-badge-gray">
                  {TIER_LABEL[tier] ?? session.plan}
                </span>
                {tier !== 'pro_plus' && (
                  <a
                    className="ps-btn ps-btn-primary ps-btn-sm"
                    href={upgradeUrl(session.id, tier === 'pro' ? 'pro_plus' : 'pro')}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Upgrade plan
                  </a>
                )}
              </div>
            </div>

            <div className="ps-settings-row">
              <div className="ps-settings-row-info">
                <div className="ps-settings-row-label">Google account</div>
                <div className="ps-settings-row-desc">
                  {session.ownerEmail
                    ? `Signed in as ${session.ownerEmail}`
                    : gauthEnabled
                      ? 'Sign in for the full free plan and redeem codes.'
                      : 'Google sign-in isn’t available right now.'}
                </div>
              </div>
              {session.ownerEmail ? (
                <button type="button" className="ps-btn ps-btn-text-danger ps-btn-sm" onClick={onSignOut}>
                  Sign out
                </button>
              ) : gauthEnabled && (
                <button
                  className="ps-btn ps-btn-secondary ps-btn-sm"
                  onClick={onVerify}
                  disabled={verifying}
                >
                  {verifying ? 'Check your browser…' : 'Sign in with Google'}
                </button>
              )}
            </div>

            <div className="ps-settings-row">
              <div className="ps-settings-row-info">
                <div className="ps-settings-row-label">Web account</div>
                <div className="ps-settings-row-desc">Billing, invoices and usage history in your browser</div>
              </div>
              <a
                className="ps-btn ps-btn-secondary ps-btn-sm"
                href={`https://${ROOT_DOMAIN}/account?clientId=${encodeURIComponent(session.id)}`}
                target="_blank"
                rel="noreferrer"
              >
                Open in browser
              </a>
            </div>
          </section>

          <TeamSection clientId={session.id} signedIn={Boolean(session.ownerEmail)} onVerify={onVerify} verifying={verifying} gauthEnabled={gauthEnabled} />
        </div>
      </div>
    </div>
  )
}

function TeamSection({ clientId, signedIn, onVerify, verifying, gauthEnabled }: {
  clientId: string
  signedIn: boolean
  onVerify: () => void
  verifying: boolean
  gauthEnabled: boolean
}) {
  const [members, setMembers] = useState<TeamMember[]>([])
  const [shared, setShared] = useState<SharedWorkspace[]>([])
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<'editor' | 'viewer'>('editor')
  const [busy, setBusy] = useState(false)
  const [loaded, setLoaded] = useState(false)

  const refresh = async () => {
    const [nextMembers, nextShared] = await Promise.all([
      listTeam(clientId),
      listSharedWorkspaces(clientId),
    ])
    setMembers(nextMembers)
    setShared(nextShared)
    setLoaded(true)
  }

  useEffect(() => {
    let alive = true
    refresh().catch(err => { if (alive) toast.error(extractError(err)) })
    return () => { alive = false }
  }, [clientId])

  const invite = async () => {
    const value = email.trim()
    if (!value) return
    setBusy(true)
    try {
      const invite = await inviteTeamMember(clientId, value, role)
      setEmail('')
      await refresh()
      try {
        await navigator.clipboard.writeText(invite.inviteUrl)
        toast.success(`Invite link copied for ${invite.email}`)
      } catch {
        toast.success(`Invite created for ${invite.email}`)
      }
    } catch (err) {
      toast.error(extractError(err))
    } finally {
      setBusy(false)
    }
  }

  const remove = async (member: TeamMember) => {
    setBusy(true)
    try {
      await revokeTeamMember(clientId, member.id)
      await refresh()
      toast.success(`Removed ${member.email}`)
    } catch (err) {
      toast.error(extractError(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="ps-card ps-settings-section">
      <div className="ps-settings-section-title">Team</div>
      <p className="ps-settings-row-desc" style={{ marginBottom: 12 }}>
        Invite teammates by email. They accept on the web, then can open shared workspaces from this app.
      </p>

      {!signedIn ? (
        <div className="ps-settings-row">
          <div className="ps-settings-row-info">
            <div className="ps-settings-row-label">Sign in required</div>
            <div className="ps-settings-row-desc">Google sign-in is needed before you can invite people.</div>
          </div>
          {gauthEnabled && (
            <button className="ps-btn ps-btn-secondary ps-btn-sm" onClick={onVerify} disabled={verifying}>
              {verifying ? 'Check your browser…' : 'Sign in with Google'}
            </button>
          )}
        </div>
      ) : (
        <>
          <form
            className="ps-settings-row"
            style={{ alignItems: 'flex-end', gap: 8, flexWrap: 'wrap' }}
            onSubmit={event => { event.preventDefault(); void invite() }}
          >
            <div style={{ flex: '1 1 180px' }}>
              <label className="ps-label" htmlFor="team-email">Email</label>
              <input id="team-email" className="ps-input" type="email" value={email} onChange={event => setEmail(event.target.value)} placeholder="teammate@company.com" autoComplete="off" />
            </div>
            <div>
              <label className="ps-label" htmlFor="team-role">Role</label>
              <select id="team-role" className="ps-select" value={role} onChange={event => setRole(event.target.value as 'editor' | 'viewer')}>
                <option value="editor">Editor</option>
                <option value="viewer">Viewer</option>
              </select>
            </div>
            <button type="submit" className="ps-btn ps-btn-primary ps-btn-sm" disabled={busy || !email.trim()}>
              {busy ? 'Inviting…' : 'Invite'}
            </button>
          </form>

          {!loaded ? (
            <p className="ps-settings-row-desc">Loading team…</p>
          ) : members.length === 0 ? (
            <p className="ps-settings-row-desc">No teammates yet.</p>
          ) : (
            <ul className="ps-share-notes" style={{ marginTop: 12 }}>
              {members.map(member => (
                <li key={member.id}>
                  <div className="ps-feedback-meta" style={{ justifyContent: 'space-between', width: '100%' }}>
                    <span>
                      <strong>{member.email}</strong>
                      {' · '}
                      {member.role}
                      {' · '}
                      {member.status === 'pending' ? 'Pending' : 'Active'}
                    </span>
                    <button type="button" className="ps-btn ps-btn-ghost ps-btn-sm ps-btn-text-danger" disabled={busy} onClick={() => void remove(member)}>
                      Remove
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {shared.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <div className="ps-settings-row-label">Shared with you</div>
          <ul className="ps-share-notes" style={{ marginTop: 8 }}>
            {shared.map(workspace => (
              <li key={workspace.ownerClientId}>
                <strong>{workspace.ownerEmail || 'Teammate workspace'}</strong>
                {' · '}
                {workspace.role}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}
