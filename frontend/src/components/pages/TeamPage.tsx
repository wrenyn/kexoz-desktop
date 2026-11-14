import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { toast } from 'react-hot-toast'
import {
  ROOT_DOMAIN,
  inviteTeamMember,
  listSharedWorkspaces,
  listTeam,
  revokeTeamMember,
  teamInviteRoleForMember,
  teamRoleLabel,
  type ClientSession,
  type SharedWorkspace,
  type TeamInviteRole,
  type TeamMember,
} from '../../lib/api'
import { extractError } from '../../lib/utils'
import LoadingBlock from '../ui/LoadingBlock'
import Spinner from '../ui/Spinner'
import PremiumEmpty from '../ui/PremiumEmpty'
import TrustNote from '../ui/TrustNote'

type Props = {
  session: ClientSession
  onVerify: () => void
  verifying: boolean
  gauthEnabled: boolean
  onSignOut: () => void
}

type InviteUiRole = 'admin' | 'developer' | 'reviewer' | 'viewer'

const INVITE_ROLES: { value: InviteUiRole; label: string; api: TeamInviteRole }[] = [
  { value: 'admin', label: 'Admin', api: 'admin' },
  { value: 'developer', label: 'Developer', api: 'developer' },
  { value: 'reviewer', label: 'Reviewer', api: 'reviewer' },
  { value: 'viewer', label: 'Viewer', api: 'viewer' },
]

const inviteUrlFor = (token: string) =>
  `https://${ROOT_DOMAIN}/account/team?invite=${encodeURIComponent(token)}`

export default function TeamPage({
  session, onVerify, verifying, gauthEnabled,
}: Props) {
  const clientId = session.id
  const signedIn = Boolean(session.ownerEmail)

  const [members, setMembers] = useState<TeamMember[]>([])
  const [shared, setShared] = useState<SharedWorkspace[]>([])
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<InviteUiRole>('developer')
  const [busy, setBusy] = useState(false)
  const [loaded, setLoaded] = useState(false)

  const refresh = useCallback(async () => {
    const [nextMembers, nextShared] = await Promise.all([
      listTeam(clientId),
      listSharedWorkspaces(clientId),
    ])
    setMembers(nextMembers)
    setShared(nextShared)
    setLoaded(true)
  }, [clientId])

  useEffect(() => {
    let alive = true
    refresh().catch(err => { if (alive) toast.error(extractError(err)) })
    return () => { alive = false }
  }, [refresh])

  const apiRole = INVITE_ROLES.find(item => item.value === role)?.api ?? 'developer'

  const invite = async (targetEmail?: string, targetRole?: TeamInviteRole) => {
    const value = (targetEmail ?? email).trim()
    if (!value) return
    const sendRole = targetRole ?? apiRole
    setBusy(true)
    try {
      const result = await inviteTeamMember(clientId, value, sendRole)
      if (!targetEmail) setEmail('')
      await refresh()
      try {
        await navigator.clipboard.writeText(result.inviteUrl)
        toast.success(targetEmail ? `Invite resent for ${result.email}` : `Invite link copied for ${result.email}`)
      } catch {
        toast.success(targetEmail ? `Invite resent for ${result.email}` : `Invite created for ${result.email}`)
      }
    } catch (err) {
      toast.error(extractError(err))
    } finally {
      setBusy(false)
    }
  }

  const resend = (member: TeamMember) => {
    void invite(member.email, teamInviteRoleForMember(member.role))
  }

  const copyPendingLink = async (member: TeamMember) => {
    const token = member.inviteToken?.trim()
    if (!token) {
      toast.error('No invite token — resend the invite to get a fresh link.')
      return
    }
    try {
      await navigator.clipboard.writeText(inviteUrlFor(token))
      toast.success('Invite link copied')
    } catch {
      toast.error('Could not copy the invite link')
    }
  }

  const remove = async (member: TeamMember) => {
    setBusy(true)
    try {
      await revokeTeamMember(clientId, member.id)
      await refresh()
      toast.success(member.status === 'pending' ? `Revoked invite for ${member.email}` : `Removed ${member.email}`)
    } catch (err) {
      toast.error(extractError(err))
    } finally {
      setBusy(false)
    }
  }

  const pending = members.filter(member => member.status === 'pending')
  const active = members.filter(member => member.status !== 'pending')

  return (
    <div className="ps-main">
      <div className="ps-page-header animate-fade-down">
        <div>
          <h1 className="ps-page-title">Team</h1>
          <p className="ps-page-subtitle">
            Invite people and manage workspace access
            {pending.length > 0 ? ` · ${pending.length} pending` : ''}
          </p>
        </div>
      </div>

      <div className="ps-page-content">
        <div className="ps-settings-page animate-fade-up">
          <section className="ps-card ps-settings-section">
            <div className="ps-settings-section-title">Workspace owner</div>
            <div className="ps-settings-row">
              <div className="ps-settings-row-info">
                <div className="ps-settings-row-label">Owner</div>
                <div className="ps-settings-row-desc">
                  {session.ownerEmail || 'Sign in to claim this workspace as owner.'}
                  {' · '}
                  Full access; owners are not inviteable.
                </div>
              </div>
              <span className="ps-badge ps-badge-mint">Owner</span>
            </div>
          </section>

          <section className="ps-card ps-settings-section">
            <div className="ps-settings-section-title">Invite teammates</div>
            <p className="ps-settings-row-desc" style={{ marginBottom: 12 }}>
              Teammates accept on the web, then can open shared workspaces from this app.
            </p>

            {!signedIn ? (
              <div className="ps-settings-row">
                <div className="ps-settings-row-info">
                  <div className="ps-settings-row-label">Sign in required</div>
                  <div className="ps-settings-row-desc">Google sign-in is needed before you can invite people.</div>
                </div>
                {gauthEnabled && (
                  <button type="button" className={`ps-btn ps-btn-secondary ps-btn-sm ${verifying ? 'is-loading' : ''}`} onClick={onVerify} disabled={verifying} aria-busy={verifying || undefined}>
                    {verifying ? <><Spinner size={13} /> Waiting for Google</> : 'Sign in with Google'}
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
                    <input
                      id="team-email"
                      className="ps-input"
                      type="email"
                      value={email}
                      onChange={event => setEmail(event.target.value)}
                      placeholder="teammate@company.com"
                      autoComplete="off"
                    />
                  </div>
                  <div>
                    <label className="ps-label" htmlFor="team-role">Role</label>
                    <select
                      id="team-role"
                      className="ps-select"
                      value={role}
                      onChange={event => setRole(event.target.value as InviteUiRole)}
                    >
                      {INVITE_ROLES.map(item => (
                        <option key={item.value} value={item.value}>{item.label}</option>
                      ))}
                    </select>
                  </div>
                  <button type="submit" className={`ps-btn ps-btn-primary ps-btn-sm ${busy ? 'is-loading' : ''}`} disabled={busy || !email.trim()}>
                    {busy ? <><Spinner size={13} /> Inviting</> : 'Invite'}
                  </button>
                </form>

                {!loaded ? (
                  <LoadingBlock label="Loading team" compact rows={3} />
                ) : members.length === 0 ? (
                  <>
                    <PremiumEmpty title="No teammates yet">
                      Invite someone above. Admins manage the workspace; members review and comment; guests see assigned work only.
                    </PremiumEmpty>
                    <TrustNote title="Invite links" tone="ok">
                      Each invite creates a link you can copy and send. Links stay valid until revoked.
                    </TrustNote>
                  </>
                ) : (
                  <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 16 }}>
                    {pending.length > 0 && (
                      <MemberGroup title="Pending">
                        <MemberList
                          members={pending}
                          busy={busy}
                          onResend={resend}
                          onCopyLink={copyPendingLink}
                          onRemove={remove}
                          pending
                        />
                      </MemberGroup>
                    )}
                    {active.length > 0 && (
                      <MemberGroup title="Active">
                        <MemberList members={active} busy={busy} onResend={resend} onCopyLink={copyPendingLink} onRemove={remove} />
                      </MemberGroup>
                    )}
                  </div>
                )}
              </>
            )}
          </section>

          {shared.length > 0 && (
            <section className="ps-card ps-settings-section">
              <div className="ps-settings-section-title">Shared with you</div>
              <ul className="ps-share-notes" style={{ marginTop: 8 }}>
                {shared.map(workspace => (
                  <li key={workspace.ownerClientId}>
                    <SharedRow
                      email={workspace.ownerEmail || 'Teammate workspace'}
                      role={teamRoleLabel(workspace.role)}
                    />
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </div>
    </div>
  )
}

function MemberGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <div className="ps-settings-row-label" style={{ marginBottom: 8 }}>{title}</div>
      {children}
    </div>
  )
}

function SharedRow({ email, role }: { email: string; role: string }) {
  return (
    <div className="ps-feedback-meta" style={{ justifyContent: 'space-between', width: '100%' }}>
      <span>
        <strong>{email}</strong>
        {' · '}
        {role}
      </span>
    </div>
  )
}

function MemberList({
  members, busy, onResend, onCopyLink, onRemove, pending = false,
}: {
  members: TeamMember[]
  busy: boolean
  onResend: (member: TeamMember) => void
  onCopyLink: (member: TeamMember) => void
  onRemove: (member: TeamMember) => void
  pending?: boolean
}) {
  return (
    <ul className="ps-share-notes">
      {members.map(member => (
        <li key={member.id}>
          <div className="ps-feedback-meta" style={{ justifyContent: 'space-between', width: '100%', gap: 8, flexWrap: 'wrap' }}>
            <span>
              <strong>{member.email}</strong>
              {' · '}
              {teamRoleLabel(member.role)}
              {!pending && (
                <>
                  {' · '}
                  Active
                </>
              )}
            </span>
            <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {pending && (
                <>
                  <button type="button" className="ps-btn ps-btn-ghost ps-btn-sm" disabled={busy} onClick={() => onResend(member)}>
                    Resend
                  </button>
                  <button type="button" className="ps-btn ps-btn-ghost ps-btn-sm" disabled={busy} onClick={() => void onCopyLink(member)}>
                    Copy link
                  </button>
                </>
              )}
              <button
                type="button"
                className="ps-btn ps-btn-ghost ps-btn-sm ps-btn-text-danger"
                disabled={busy}
                onClick={() => void onRemove(member)}
              >
                {pending ? 'Revoke' : 'Remove'}
              </button>
            </span>
          </div>
        </li>
      ))}
    </ul>
  )
}
