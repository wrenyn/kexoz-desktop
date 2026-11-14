import { useEffect, useState } from 'react'
import { ROOT_DOMAIN, tierOf, upgradeUrl, type ClientSession } from '../../lib/api'
import { useCopy } from '../../hooks/useCopy'
import TrustNote from '../ui/TrustNote'

type Props = {
  session: ClientSession
  onVerify: () => void
  verifying: boolean
  gauthEnabled: boolean
  onSignOut: () => void
  onOpenTeam?: () => void
  onOpenAccount?: () => void
}

type Section = 'workspace' | 'appearance' | 'notifications' | 'developer' | 'billing' | 'security'

const SECTIONS: { id: Section; label: string }[] = [
  { id: 'workspace', label: 'Workspace' },
  { id: 'appearance', label: 'Appearance' },
  { id: 'notifications', label: 'Notifications' },
  { id: 'developer', label: 'Developer' },
  { id: 'billing', label: 'Billing' },
  { id: 'security', label: 'Security' },
]

const DESKTOP_NOTIFY_KEY = 'kexoz-notify-desktop'
const ASSIGNMENT_NOTIFY_KEY = 'kexoz-notify-assignment'

function readFlag(key: string, fallback = true) {
  try {
    const raw = window.localStorage.getItem(key)
    if (raw == null) return fallback
    return raw === '1' || raw === 'true'
  } catch {
    return fallback
  }
}

function writeFlag(key: string, value: boolean) {
  try {
    window.localStorage.setItem(key, value ? '1' : '0')
  } catch {
    // ignore
  }
}

export default function SettingsPage({
  session, onSignOut, onOpenTeam, onOpenAccount,
}: Props) {
  const tier = tierOf(session)
  const [section, setSection] = useState<Section>('workspace')
  const [desktopNotify, setDesktopNotify] = useState(() => readFlag(DESKTOP_NOTIFY_KEY, true))
  const [assignmentNotify, setAssignmentNotify] = useState(() => readFlag(ASSIGNMENT_NOTIFY_KEY, true))
  const { copied, copy } = useCopy()

  useEffect(() => { writeFlag(DESKTOP_NOTIFY_KEY, desktopNotify) }, [desktopNotify])
  useEffect(() => { writeFlag(ASSIGNMENT_NOTIFY_KEY, assignmentNotify) }, [assignmentNotify])

  return (
    <div className="ps-main">
      <div className="ps-page-header animate-fade-down">
        <div>
          <h1 className="ps-page-title">Settings</h1>
          <p className="ps-page-subtitle">Workspace preferences, notifications, and developer options</p>
        </div>
      </div>

      <div className="ps-page-content">
        <div className="ps-settings-layout animate-fade-up">
          <nav className="ps-settings-nav" aria-label="Settings sections">
            {SECTIONS.map(item => (
              <button
                key={item.id}
                type="button"
                className={`ps-settings-nav-item${section === item.id ? ' active' : ''}`}
                aria-current={section === item.id ? 'true' : undefined}
                onClick={() => setSection(item.id)}
              >
                {item.label}
              </button>
            ))}
          </nav>

          <div className="ps-settings-page">
            {section === 'workspace' && (
              <section className="ps-card ps-settings-section">
                <div className="ps-settings-section-title">Workspace preferences</div>
                <div className="ps-settings-row">
                  <div className="ps-settings-row-info">
                    <div className="ps-settings-row-label">Members</div>
                    <div className="ps-settings-row-desc">Invites and roles live on the Team page</div>
                  </div>
                  <button type="button" className="ps-btn ps-btn-secondary ps-btn-sm" onClick={onOpenTeam}>Open Team</button>
                </div>
                <div className="ps-settings-row">
                  <div className="ps-settings-row-info">
                    <div className="ps-settings-row-label">Account</div>
                    <div className="ps-settings-row-desc">Profile, plan, and sign-in</div>
                  </div>
                  <button type="button" className="ps-btn ps-btn-secondary ps-btn-sm" onClick={onOpenAccount}>Open Account</button>
                </div>
                <div className="ps-settings-row">
                  <div className="ps-settings-row-info">
                    <div className="ps-settings-row-label">Subdomain</div>
                    <div className="ps-settings-row-desc">{session.subdomain || '—'}</div>
                  </div>
                </div>
                <div className="ps-settings-row">
                  <div className="ps-settings-row-info">
                    <div className="ps-settings-row-label">External reviewers</div>
                    <div className="ps-settings-row-desc">Clients can review on the website without installing desktop.</div>
                  </div>
                </div>
              </section>
            )}

            {section === 'appearance' && (
              <section className="ps-card ps-settings-section">
                <div className="ps-settings-section-title">Appearance</div>
                <div className="ps-settings-row">
                  <div className="ps-settings-row-info">
                    <div className="ps-settings-row-label">Theme</div>
                    <div className="ps-settings-row-desc">
                      Kexoz desktop uses the Obsidian + Lime dark theme only.
                    </div>
                  </div>
                  <span className="ps-badge ps-badge-gray">Dark</span>
                </div>
              </section>
            )}

            {section === 'notifications' && (
              <section className="ps-card ps-settings-section">
                <div className="ps-settings-section-title">Notifications</div>
                <ToggleRow
                  label="Desktop notifications"
                  desc="OS notifications for new feedback while Kexoz is running"
                  checked={desktopNotify}
                  onChange={setDesktopNotify}
                />
                <ToggleRow
                  label="Assignment updates"
                  desc="Notify you when a teammate assigns feedback to your email."
                  checked={assignmentNotify}
                  onChange={setAssignmentNotify}
                />
              </section>
            )}

            {section === 'developer' && (
              <section className="ps-card ps-settings-section">
                <div className="ps-settings-section-title">Developer</div>
                <div className="ps-settings-row">
                  <div className="ps-settings-row-info">
                    <div className="ps-settings-row-label">CLI</div>
                    <div className="ps-settings-row-desc">
                      Run <code style={{ color: 'var(--accent)' }}>kexoz</code> from a terminal alongside this app for the same workspace.
                    </div>
                  </div>
                </div>
                <div className="ps-settings-row">
                  <div className="ps-settings-row-info">
                    <div className="ps-settings-row-label">Mobile Preview</div>
                    <div className="ps-settings-row-desc">
                      Android emulator/device and iPhone / Simulator preview are coming soon. Share websites and APIs today.
                    </div>
                  </div>
                </div>
                <div className="ps-settings-row">
                  <div className="ps-settings-row-info">
                    <div className="ps-settings-row-label">Client ID</div>
                    <div className="ps-settings-row-desc" style={{ fontFamily: 'var(--font-mono)', wordBreak: 'break-all' }}>
                      {session.id}
                    </div>
                  </div>
                  <button
                    type="button"
                    className="ps-btn ps-btn-secondary ps-btn-sm"
                    onClick={() => void copy('client-id', session.id)}
                  >
                    {copied === 'client-id' ? 'Copied' : 'Copy'}
                  </button>
                </div>
              </section>
            )}

            {section === 'billing' && (
              <section className="ps-card ps-settings-section">
                <div className="ps-settings-section-title">Billing</div>
                <div className="ps-settings-row">
                  <div className="ps-settings-row-info">
                    <div className="ps-settings-row-label">Plan & invoices</div>
                    <div className="ps-settings-row-desc">Billing and usage on the web account.</div>
                  </div>
                  <a
                    className="ps-btn ps-btn-secondary ps-btn-sm"
                    href={`https://${ROOT_DOMAIN}/account?clientId=${encodeURIComponent(session.id)}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open billing
                  </a>
                </div>
                {tier !== 'pro_plus' && (
                  <div className="ps-settings-row">
                    <div className="ps-settings-row-info">
                      <div className="ps-settings-row-label">Upgrade</div>
                      <div className="ps-settings-row-desc">More concurrent previews and feedback capacity.</div>
                    </div>
                    <a
                      className="ps-btn ps-btn-primary ps-btn-sm"
                      href={upgradeUrl(session.id, tier === 'pro' ? 'pro_plus' : 'pro')}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Upgrade plan
                    </a>
                  </div>
                )}
              </section>
            )}

            {section === 'security' && (
              <section className="ps-card ps-settings-section animate-fade-in">
                <div className="ps-settings-section-title">Security</div>
                <div className="ps-settings-row">
                  <div className="ps-settings-row-info">
                    <div className="ps-settings-row-label">Sign out</div>
                    <div className="ps-settings-row-desc">Clears Google sign-in on this install. Local shares stay until you remove them.</div>
                  </div>
                  {session.ownerEmail ? (
                    <button type="button" className="ps-btn ps-btn-text-danger ps-btn-sm" onClick={onSignOut}>
                      Sign out
                    </button>
                  ) : (
                    <span className="ps-badge ps-badge-gray">Guest</span>
                  )}
                </div>
                <TrustNote title="What sign-out does" tone="warn">
                  You leave the team and billing account on this computer. Running shares keep working until you stop them.
                </TrustNote>
              </section>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function ToggleRow({
  label, desc, checked, onChange,
}: { label: string; desc: string; checked: boolean; onChange: (next: boolean) => void }) {
  return (
    <div className="ps-settings-row ps-ns-toggle-row">
      <div className="ps-settings-row-info">
        <div className="ps-settings-row-label">{label}</div>
        <div className="ps-settings-row-desc">{desc}</div>
      </div>
      <label className="ps-toggle">
        <input type="checkbox" checked={checked} onChange={event => onChange(event.target.checked)} />
        <span className="ps-toggle-track" />
      </label>
    </div>
  )
}
