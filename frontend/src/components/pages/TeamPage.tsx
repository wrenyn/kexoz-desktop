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
import LoadError from '../ui/LoadError'
import { useConfirm } from '../../hooks/useConfirm'

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
  const [loadError, setLoadError] = useState('')
  const { confirm, dialog } = useConfirm()

  const refresh = useCallback(async () => {
    setLoadError('')
    try {
      const [nextMembers, nextShared] = await Promise.all([listTeam(clientId), listSharedWorkspaces(clientId)])
      setMembers(nextMembers)
      setShared(nextShared)
    } catch {
      setLoadError('Your team couldn’t be loaded. Check your connection and try again.')
    } finally {
      setLoaded(true)
    }
  }, [clientId])

  useEffect(() => {
    if (signedIn) void refresh()
  }, [refresh, signedIn])

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
    if (!(await confirm({
      title: member.status === 'pending' ? 'Revoke this invitation?' : 'Remove this teammate?',
      message: member.status === 'pending' ? `The invitation for ${member.email} will stop working.` : `${member.email} will lose access to this workspace. You can invite them again later.`,
      confirmLabel: member.status === 'pending' ? 'Revoke invitation' : 'Remove teammate',
      tone: 'danger',
    }))) return
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
      {dialog}
      <div className="ps-page-header animate-fade-down">
        <div>
          <h1 className="ps-page-title">Team</h1>
          <p className="ps-page-subtitle">Invite teammates and manage access to your workspace.</p>
        </div>
      </div>

      <div className="ps-page-content">
        {loadError && <LoadError message={loadError} onRetry={() => void refresh()} />}
        <div className="ps-settings-page animate-fade-up">
          <section className="ps-card ps-settings-section">
            <div className="ps-settings-section-title">Workspace owner</div>
            <div className="ps-settings-row">
              <div className="ps-settings-row-info">
                <div className="ps-settings-row-label">Owner</div>
                <div className="ps-settings-row-desc">
                  {session.ownerEmail || 'Sign in to claim this workspace as owner.'}
                  {' · '}
                  The workspace owner has full access.
                </div>
              </div>
              <span className="ps-badge ps-badge-mint">Owner</span>
            </div>
          </section>

          <section className="ps-card ps-settings-section">
            <div className="ps-settings-section-title">Invite teammates</div>

            {!signedIn ? (
              <div className="ps-settings-row">
                <div className="ps-settings-row-info">
                  <div className="ps-settings-row-label">Sign in required</div>
                  <div className="ps-settings-row-desc">Sign in to become the workspace owner and invite teammates.</div>
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
                  className="ps-team-invite-form"
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
                      required
                      disabled={busy}
                    />
                  </div>
                  <div>
                    <label className="ps-label" htmlFor="team-role">Role</label>
                    <select
                      id="team-role"
                      className="ps-select"
                      value={role}
                      disabled={busy}
                      onChange={event => setRole(event.target.value as InviteUiRole)}
                    >
                      {INVITE_ROLES.map(item => (
                        <option key={item.value} value={item.value}>{item.label}</option>
                      ))}
                    </select>
                  </div>
                  <button type="submit" className={`ps-btn ps-btn-primary ps-btn-sm ${busy ? 'is-loading' : ''}`} disabled={busy || !loaded || !email.trim()}>
                    {busy ? <><Spinner size={13} /> Inviting</> : 'Invite'}
                  </button>
                </form>

                {!loaded ? (
                  <LoadingBlock label="Loading team" compact rows={3} />
                ) : members.length === 0 && !loadError ? (
                  <PremiumEmpty title="Your team starts here">Invite someone by email, then send them the invitation link. Choose a role that matches the access they need.</PremiumEmpty>
                ) : (
                  <div className="ps-team-member-groups">
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
              <ul className="ps-team-list" style={{ marginTop: 8 }}>
                {shared.map(workspace => {
                  const email = workspace.ownerEmail || 'Teammate workspace'
                  const initial = (email.trim()[0] || '?').toUpperCase()
                  return (
                    <li key={workspace.ownerClientId} className="ps-team-row">
                      <span className="ps-team-avatar" aria-hidden="true">{initial}</span>
                      <div className="ps-team-info">
                        <span className="ps-team-email">{email}</span>
                        <span className="ps-team-meta">
                          <span className="ps-badge ps-badge-gray">{teamRoleLabel(workspace.role)}</span>
                          <span className="ps-team-status">Shared with you</span>
                        </span>
                      </div>
                    </li>
                  )
                })}
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
    <ul className="ps-team-list">
      {members.map(member => {
        const initial = (member.email?.trim()?.[0] || '?').toUpperCase()
        return (
          <li key={member.id} className={`ps-team-row${pending ? ' is-pending' : ''}`}>
            <span className="ps-team-avatar" aria-hidden="true">{initial}</span>
            <div className="ps-team-info">
              <span className="ps-team-email">{member.email}</span>
              <span className="ps-team-meta">
                <span className="ps-badge ps-badge-gray">{teamRoleLabel(member.role)}</span>
                {pending ? <span className="ps-team-status">Pending invite</span> : <span className="ps-team-status">Active</span>}
              </span>
            </div>
            <div className="ps-team-actions">
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
            </div>
          </li>
        )
      })}
    </ul>
  )
}
