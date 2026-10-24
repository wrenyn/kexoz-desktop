import { tierOf, type ClientSession } from '../../lib/api'
import { ROOT_DOMAIN } from '../../lib/api'

type Props = {
  theme: 'light' | 'dark'
  onToggleTheme: () => void
  session: ClientSession
  onVerify: () => void
  onUpgrade: () => void
  verifying: boolean
  gauthEnabled: boolean
}

const TIER_LABEL: Record<string, string> = {
  anonymous: 'Guest · 100 MB',
  verified:  'Free · 1 GB',
  pro:       'Pro · 5 GB',
  pro_plus:  'Pro+ · 10 GB',
}

export default function SettingsPage({
  theme, onToggleTheme,
  session, onVerify, onUpgrade,
  verifying, gauthEnabled,
}: Props) {
  const tier = tierOf(session)

  return (
    <div className="ps-main">
      <div className="ps-page-header animate-fade-down">
        <div>
          <h1 className="ps-page-title">Settings</h1>
          <p className="ps-page-subtitle">Appearance and your account</p>
        </div>
      </div>

      <div className="ps-page-content">
        <div className="ps-settings-page animate-fade-up">

          <section className="ps-card ps-settings-section">
            <div className="ps-settings-section-title">General</div>

            <div className="ps-settings-row">
              <div className="ps-settings-row-info">
                <div className="ps-settings-row-label">Dark mode</div>
                <div className="ps-settings-row-desc">Use the dark theme on this device</div>
              </div>
              <label className="ps-toggle">
                <input type="checkbox" checked={theme === 'dark'} onChange={onToggleTheme} aria-label="Dark mode" />
                <div className="ps-toggle-track" />
              </label>
            </div>
          </section>

          <section className="ps-card ps-settings-section">
            <div className="ps-settings-section-title">Account</div>

            <div className="ps-settings-row">
              <div className="ps-settings-row-info">
                <div className="ps-settings-row-label">Plan</div>
                <div className="ps-settings-row-desc">Monthly bandwidth for your shares</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span className="ps-badge ps-badge-gray">
                  {TIER_LABEL[tier] ?? session.plan}
                </span>
                {tier !== 'pro_plus' && (
                  <button className="ps-btn ps-btn-secondary ps-btn-sm" onClick={onUpgrade}>
                    See plans
                  </button>
                )}
              </div>
            </div>

            <div className="ps-settings-row">
              <div className="ps-settings-row-info">
                <div className="ps-settings-row-label">Google account</div>
                <div className="ps-settings-row-desc">
                  {session.ownerEmail
                    ? `Signed in as ${session.ownerEmail}`
                    : 'Not signed in'}
                </div>
              </div>
              {session.ownerEmail ? (
                <span className="ps-badge ps-badge-green">Signed in</span>
              ) : !gauthEnabled ? (
                <span className="ps-badge ps-badge-gray">Unavailable</span>
              ) : (
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
                Open
              </a>
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
