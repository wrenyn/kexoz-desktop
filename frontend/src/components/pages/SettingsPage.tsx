import { useState } from 'react'
import { tierOf, type ClientSession, type PersistentTunnel } from '../../lib/api'
import { API_BASE_URL, ROOT_DOMAIN } from '../../lib/api'

type SettingsSection = 'appearance' | 'tunnel' | 'account'

const sections: { id: SettingsSection; label: string }[] = [
  { id: 'appearance', label: 'Appearance' },
  { id: 'tunnel',     label: 'Tunnel'     },
  { id: 'account',    label: 'Account'    },
]

type Props = {
  theme: 'light' | 'dark'
  onToggleTheme: () => void
  autoStart: boolean
  onToggleAutoStart: () => void
  session: ClientSession
  onVerify: () => void
  onUpgrade: () => void
  onCopyClientId: () => void
  verifying: boolean
  gauthEnabled: boolean
  tunnels: PersistentTunnel[]
  onExportTunnels: () => void
  onImportTunnels: (file: File) => void
  portInput: string
}

const TIER_LABEL: Record<string, string> = {
  anonymous: 'Guest • 100 MB',
  verified:  'Verified • 1 GB free',
  pro:       'Pro • 5 GB',
  pro_plus:  'Pro+ • 10 GB',
}

export default function SettingsPage({
  theme, onToggleTheme, autoStart, onToggleAutoStart,
  session, onVerify, onUpgrade, onCopyClientId,
  verifying, gauthEnabled, tunnels, onExportTunnels, onImportTunnels,
  portInput,
}: Props) {
  const [active, setActive] = useState<SettingsSection>('appearance')
  const tier = tierOf(session)

  return (
    <div className="ps-main">
      <div className="ps-page-header animate-fade-down">
        <div>
          <h1 className="ps-page-title">Settings</h1>
        </div>
      </div>

      <div className="ps-page-content" style={{ flex: 1, overflow: 'hidden', padding: '16px 28px 28px' }}>
        <div className="ps-settings-layout ps-card animate-fade-up" style={{ height: 'calc(100vh - 160px)' }}>
          <div className="ps-settings-nav">
            {sections.map(({ id, label }) => (
              <button
                key={id}
                className={`ps-settings-nav-item ${active === id ? 'active' : ''}`}
                onClick={() => setActive(id)}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="ps-settings-content">

            {/* ── Appearance ── */}
            {active === 'appearance' && (
              <div className="ps-settings-section animate-fade-in">
                <div className="ps-settings-section-title">Appearance</div>

                <div className="ps-settings-row">
                  <div className="ps-settings-row-info">
                    <div className="ps-settings-row-label">Theme</div>
                    <div className="ps-settings-row-desc">Dark and light modes for this device</div>
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button
                      className={`ps-btn ps-btn-sm ${theme === 'dark' ? 'ps-btn-primary' : 'ps-btn-secondary'}`}
                      onClick={() => theme !== 'dark' && onToggleTheme()}
                    >
                      Dark
                    </button>
                    <button
                      className={`ps-btn ps-btn-sm ${theme === 'light' ? 'ps-btn-primary' : 'ps-btn-secondary'}`}
                      onClick={() => theme !== 'light' && onToggleTheme()}
                    >
                      Light
                    </button>
                  </div>
                </div>

                <div className="ps-settings-row">
                  <div className="ps-settings-row-info">
                    <div className="ps-settings-row-label">Start on boot</div>
                    <div className="ps-settings-row-desc">Launch Kexoz in the background at system startup</div>
                  </div>
                  <label className="ps-toggle">
                    <input type="checkbox" checked={autoStart} onChange={onToggleAutoStart} />
                    <div className="ps-toggle-track" />
                  </label>
                </div>

                <div className="ps-settings-row">
                  <div className="ps-settings-row-info">
                    <div className="ps-settings-row-label">Keyboard shortcuts</div>
                    <div className="ps-settings-row-desc">Navigate quickly without leaving the keyboard</div>
                  </div>
                  <span style={{ color: 'var(--text-soft)', fontFamily: 'var(--mono-font)', fontSize: 11 }}>Ctrl+1-5, Ctrl+N</span>
                </div>

                <div className="ps-settings-row">
                  <div className="ps-settings-row-info">
                    <div className="ps-settings-row-label">Web account</div>
                    <div className="ps-settings-row-desc">View plans, usage, invoices, and renewal status</div>
                  </div>
                  <a
                    className="ps-btn ps-btn-secondary ps-btn-sm"
                    href={`https://${ROOT_DOMAIN}/account?clientId=${encodeURIComponent(session.id)}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open
                  </a>
                </div>
              </div>
            )}

            {/* ── Tunnel ── */}
            {active === 'tunnel' && (
              <div className="ps-settings-section animate-fade-in">
                <div className="ps-settings-section-title">Connection</div>

                <div className="ps-settings-row">
                  <div className="ps-settings-row-info">
                    <div className="ps-settings-row-label">Auto-reconnect</div>
                    <div className="ps-settings-row-desc">Reconnects automatically if the socket drops</div>
                  </div>
                  <span className="ps-badge ps-badge-green">Always on</span>
                </div>

                <div className="ps-settings-row">
                  <div className="ps-settings-row-info">
                    <div className="ps-settings-row-label">Control plane</div>
                    <div className="ps-settings-row-desc">API endpoint used by this build</div>
                  </div>
                  <span style={{ fontFamily: 'var(--mono-font)', fontSize: 11, color: 'var(--text-soft)' }}>
                    {API_BASE_URL.replace(/^https?:\/\//, '')}
                  </span>
                </div>

                <div className="ps-settings-row">
                  <div className="ps-settings-row-info">
                    <div className="ps-settings-row-label">Root domain</div>
                    <div className="ps-settings-row-desc">Public hostname suffix for tunnels</div>
                  </div>
                  <span style={{ fontFamily: 'var(--mono-font)', fontSize: 11, color: 'var(--text-soft)' }}>
                    {ROOT_DOMAIN}
                  </span>
                </div>

                <div className="ps-settings-row">
                  <div className="ps-settings-row-info">
                    <div className="ps-settings-row-label">Tunnel configuration</div>
                    <div className="ps-settings-row-desc">Backup or restore {tunnels.length} saved tunnel{tunnels.length === 1 ? '' : 's'} as JSON</div>
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button className="ps-btn ps-btn-secondary ps-btn-sm" onClick={onExportTunnels} disabled={!tunnels.length}>
                      Export
                    </button>
                    <label className="ps-btn ps-btn-secondary ps-btn-sm" style={{ cursor: 'pointer' }}>
                      Import
                      <input type="file" accept="application/json,.json" hidden onChange={event => {
                        const file = event.target.files?.[0]
                        if (file) onImportTunnels(file)
                        event.currentTarget.value = ''
                      }} />
                    </label>
                  </div>
                </div>

                {/* SSH quick-connect */}
                <div className="ps-settings-section-title" style={{ marginTop: 8 }}>SSH quick-connect</div>
                <div style={{ fontSize: 12.5, color: 'var(--text-soft)', marginBottom: 8 }}>
                  No client install needed — use native SSH from any machine.
                </div>
                <div className="ps-code">
                  ssh -R 80:localhost:{portInput || '3000'} kexoz.dev
                </div>
              </div>
            )}

            {/* ── Account ── */}
            {active === 'account' && (
              <div className="ps-settings-section animate-fade-in">
                <div className="ps-settings-section-title">Account</div>

                <div className="ps-settings-row">
                  <div className="ps-settings-row-info">
                    <div className="ps-settings-row-label">Plan</div>
                    <div className="ps-settings-row-desc">Current bandwidth tier for this identity</div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span className="ps-badge ps-badge-gray" style={{ textTransform: 'capitalize' }}>
                      {TIER_LABEL[tier] ?? session.plan}
                    </span>
                    {tier !== 'pro_plus' && (
                      <button className="ps-btn ps-btn-primary ps-btn-sm" onClick={onUpgrade}>
                        Upgrade
                      </button>
                    )}
                  </div>
                </div>

                <div className="ps-settings-row">
                  <div className="ps-settings-row-info">
                    <div className="ps-settings-row-label">Google account</div>
                    <div className="ps-settings-row-desc">
                      {session.ownerEmail
                        ? `Linked as ${session.ownerEmail}`
                        : 'Verify to unlock 1 GB free + auth wall'}
                    </div>
                  </div>
                  {session.ownerEmail ? (
                    <span className="ps-badge ps-badge-green">Verified</span>
                  ) : !gauthEnabled ? (
                    <span className="ps-badge ps-badge-gray">Unavailable</span>
                  ) : (
                    <button
                      className="ps-btn ps-btn-primary ps-btn-sm"
                      onClick={onVerify}
                      disabled={verifying}
                    >
                      {verifying ? 'Check browser…' : 'Verify'}
                    </button>
                  )}
                </div>

                <div className="ps-settings-row">
                  <div className="ps-settings-row-info">
                    <div className="ps-settings-row-label">Auth wall</div>
                    <div className="ps-settings-row-desc">Require Google sign-in for tunnel visitors</div>
                  </div>
                  <span className="ps-badge ps-badge-gray">{session.requireAuth ? 'Enabled' : 'Off'}</span>
                </div>

                <div className="ps-settings-row">
                  <div className="ps-settings-row-info">
                    <div className="ps-settings-row-label">Client ID</div>
                    <div className="ps-settings-row-desc">Your unique device identifier, stored locally</div>
                  </div>
                  <button className="ps-copy-value" onClick={onCopyClientId} title="Click to copy">
                    {session.id}
                  </button>
                </div>
              </div>
            )}

          </div>
        </div>
      </div>
    </div>
  )
}
