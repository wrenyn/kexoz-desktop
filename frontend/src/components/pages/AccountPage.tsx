import {
  ROOT_DOMAIN, tierOf, upgradeUrl, type ClientSession,
} from '../../lib/api'
import Spinner from '../ui/Spinner'

type Props = {
  session: ClientSession
  onVerify: () => void
  verifying: boolean
  gauthEnabled: boolean
  onSignOut: () => void
}

const TIER_LABEL: Record<string, string> = {
  anonymous: 'Guest',
  verified: 'Free',
  pro: 'Pro',
  pro_plus: 'Pro+',
}

export default function AccountPage({
  session, onVerify, verifying, gauthEnabled, onSignOut,
}: Props) {
  const tier = tierOf(session)

  return (
    <div className="ps-main">
      <div className="ps-page-header animate-fade-down">
        <div>
          <h1 className="ps-page-title">Account</h1>
          <p className="ps-page-subtitle">Profile, plan, and sign-in</p>
        </div>
      </div>

      <div className="ps-page-content">
        <div className="ps-settings-page animate-fade-up">
          <section className="ps-card ps-settings-section">
            <div className="ps-settings-section-title">Profile</div>
            <div className="ps-settings-row">
              <div className="ps-settings-row-info">
                <div className="ps-settings-row-label">Email</div>
                <div className="ps-settings-row-desc">
                  {session.ownerEmail || 'Guest session — sign in to sync team and billing.'}
                </div>
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
                  type="button"
                  className={`ps-btn ps-btn-secondary ps-btn-sm ${verifying ? 'is-loading' : ''}`}
                  onClick={onVerify}
                  disabled={verifying}
                >
                  {verifying ? <><Spinner size={13} /> Waiting for Google</> : 'Sign in with Google'}
                </button>
              )}
            </div>
          </section>

          <section className="ps-card ps-settings-section">
            <div className="ps-settings-section-title">Plan</div>
            <div className="ps-settings-row">
              <div className="ps-settings-row-info">
                <div className="ps-settings-row-label">Current plan</div>
                <div className="ps-settings-row-desc">Change plans or redeem a promotional code on the web</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span className="ps-badge ps-badge-gray">{TIER_LABEL[tier] ?? session.plan}</span>
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
                <div className="ps-settings-row-label">Web account</div>
                <div className="ps-settings-row-desc">Billing, invoices, and usage history in your browser</div>
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
        </div>
      </div>
    </div>
  )
}
