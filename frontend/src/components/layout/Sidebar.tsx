import { TIER_LABELS, tierOf, type ClientSession } from '../../lib/api'
import { NAV_ITEMS, type Page } from '../../lib/navigation'
import { formatBytes } from '../../lib/utils'
import Logo from '../ui/Logo'

type Props = {
  activePage: Page
  onNavigate: (page: Page) => void
  onNewShare: () => void
  session: ClientSession
  liveShares: number
  requestCount: number
  onLogin: () => void
  verifying: boolean
}

export default function Sidebar({ activePage, onNavigate, onNewShare, session, liveShares, requestCount, onLogin, verifying }: Props) {
  const tier = tierOf(session)
  const used = session.bandwidthUsed
  const limit = session.bandwidthLimit
  const pct = limit > 0 ? Math.min(100, (used / limit) * 100) : 0
  const meterTone = pct >= 100 ? 'full' : pct >= 80 ? 'high' : ''
  const email = session.ownerEmail

  const badgeFor = (id: Page) => {
    if (id === 'tunnels' && liveShares > 0) return <span className="ps-nav-badge ps-nav-badge-live">{liveShares} live</span>
    if (id === 'requests' && requestCount > 0) return <span className="ps-nav-badge">{requestCount > 999 ? '999+' : requestCount}</span>
    return null
  }

  const navButton = (id: Page, label: string, shortcut: string) => (
    <button
      key={id}
      type="button"
      className={`ps-nav-item ${activePage === id ? 'active' : ''}`}
      aria-current={activePage === id ? 'page' : undefined}
      title={`${label} (Ctrl+${shortcut})`}
      onClick={() => onNavigate(id)}
    >
      {label}
      {badgeFor(id)}
    </button>
  )

  return (
    <aside className="ps-sidebar animate-slide-left">
      <div className="ps-sidebar-brand">
        <div className="ps-brand-icon">
          <Logo style={{ width: '100%', height: '100%' }} />
        </div>
        <div className="ps-brand-name">Kexoz</div>
      </div>

      <div className="ps-sidebar-cta">
        <button type="button" className="ps-btn ps-btn-primary ps-sidebar-new" onClick={onNewShare}>
          New share
        </button>
      </div>

      <nav className="ps-nav" aria-label="Primary">
        {([1, 2] as const).map(group => (
          <div key={group} className="ps-nav-group">
            {NAV_ITEMS.filter(item => item.group === group).map(item => navButton(item.id, item.label, item.shortcut))}
          </div>
        ))}
      </nav>

      <div className="ps-sidebar-footer">
        <div className="ps-usage" title="Data through your shares this month">
          <div className="ps-usage-head">
            <span>{TIER_LABELS[tier]} plan</span>
            <span>{formatBytes(used)} of {formatBytes(limit)}</span>
          </div>
          <div className="ps-usage-bar" role="progressbar" aria-label="Data used this month" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
            <div className={meterTone} style={{ width: `${Math.max(pct, used > 0 ? 2 : 0)}%` }} />
          </div>
        </div>

        <button
          type="button"
          className={`ps-sidebar-account ${activePage === 'settings' ? 'active' : ''}`}
          aria-current={activePage === 'settings' ? 'page' : undefined}
          title="Settings (Ctrl+7)"
          onClick={() => onNavigate('settings')}
        >
          <span className="ps-account-avatar" aria-hidden="true">{email ? email.charAt(0) : 'G'}</span>
          <span className="ps-account-info">
            <span className="ps-account-email" title={email || undefined}>{email || 'Guest'}</span>
            <span className="ps-account-sub">Settings</span>
          </span>
        </button>
        {!email && (
          <button type="button" className="ps-btn ps-btn-secondary ps-btn-sm ps-sidebar-signin" onClick={onLogin} disabled={verifying}>
            {verifying ? 'Check your browser…' : 'Sign in'}
          </button>
        )}
      </div>
    </aside>
  )
}
