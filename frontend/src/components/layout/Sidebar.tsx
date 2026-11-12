import { SHARE_LIMITS, TIER_LABELS, tierOf, type ClientSession } from '../../lib/api'
import { NAV_ITEMS, type Page } from '../../lib/navigation'
import Logo from '../ui/Logo'
import Spinner from '../ui/Spinner'
import {
  Activity, FolderKanban, Globe2, LayoutDashboard, MessageSquare,
  Plus, Settings, Users, type LucideIcon,
} from 'lucide-react'

type Props = {
  activePage: Page
  onNavigate: (page: Page) => void
  onNewShare: () => void
  session: ClientSession
  liveShares: number
  shareCount: number
  requestCount: number
  reviewCount: number
  teamPending?: number
  onLogin: () => void
  verifying: boolean
}

export default function Sidebar({
  activePage, onNavigate, onNewShare, session, liveShares, shareCount,
  requestCount, reviewCount, teamPending = 0, onLogin, verifying,
}: Props) {
  const tier = tierOf(session)
  const limit = SHARE_LIMITS[tier]
  const email = session.ownerEmail?.trim() || ''
  const accountLabel = email || 'Guest'
  const planLabel = `${TIER_LABELS[tier]} · ${shareCount}/${limit}`

  const icons: Partial<Record<Page, LucideIcon>> = {
    dashboard: LayoutDashboard,
    projects: FolderKanban,
    review: MessageSquare,
    team: Users,
    domains: Globe2,
    requests: Activity,
    settings: Settings,
  }

  const badgeFor = (id: Page) => {
    if (id === 'projects' && liveShares > 0) {
      return <span className="ps-nav-badge ps-nav-badge-live">{liveShares}</span>
    }
    if (id === 'review' && reviewCount > 0) {
      return <span className="ps-nav-badge">{reviewCount > 99 ? '99+' : reviewCount}</span>
    }
    if (id === 'requests' && requestCount > 0) {
      return <span className="ps-nav-badge">{requestCount > 999 ? '999+' : requestCount}</span>
    }
    if (id === 'team' && teamPending > 0) {
      return <span className="ps-nav-badge">{teamPending > 99 ? '99+' : teamPending}</span>
    }
    return null
  }

  const navButton = (id: Page, label: string, shortcut: string) => {
    const Icon = icons[id]
    if (!Icon) return null
    return (
      <button
        key={id}
        type="button"
        className={`ps-nav-item ${activePage === id ? 'active' : ''}`}
        aria-current={activePage === id ? 'page' : undefined}
        title={`${label} (Ctrl+${shortcut})`}
        onClick={() => onNavigate(id)}
      >
        <Icon size={16} strokeWidth={1.8} aria-hidden="true" />
        <span>{label}</span>
        {badgeFor(id)}
      </button>
    )
  }

  const section = (title: string, ids: Page[]) => {
    const items = NAV_ITEMS.filter(item => ids.includes(item.id))
    if (!items.length) return null
    return (
      <div className="ps-nav-group">
        <div className="ps-nav-section-label">{title}</div>
        {items.map(item => navButton(item.id, item.label, item.shortcut))}
      </div>
    )
  }

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
          <Plus size={15} strokeWidth={2} aria-hidden="true" />
          New share
        </button>
      </div>

      <nav className="ps-nav" aria-label="Primary">
        {section('Workspace', ['dashboard', 'projects', 'review', 'team'])}
        {section('Tools', ['domains', 'requests'])}
      </nav>

      <div className="ps-sidebar-footer">
        <button
          type="button"
          className={`ps-nav-item ${activePage === 'settings' ? 'active' : ''}`}
          aria-current={activePage === 'settings' ? 'page' : undefined}
          title="Settings (Ctrl+7)"
          onClick={() => onNavigate('settings')}
        >
          <Settings size={16} strokeWidth={1.8} aria-hidden="true" />
          <span>Settings</span>
        </button>

        <div className="ps-sidebar-account-wrap">
          <button
            type="button"
            className={`ps-sidebar-account ${activePage === 'account' ? 'active' : ''}`}
            aria-current={activePage === 'account' ? 'page' : undefined}
            title="Account"
            onClick={() => onNavigate('account')}
          >
            <span className="ps-account-avatar" aria-hidden="true">{accountLabel.charAt(0).toUpperCase()}</span>
            <span className="ps-account-info">
              <span className="ps-account-email" title={email || undefined}>{accountLabel}</span>
              <span className="ps-account-sub">{planLabel}</span>
            </span>
          </button>
          {!email && (
            <button
              type="button"
              className={`ps-sidebar-signin-link ${verifying ? 'is-loading' : ''}`}
              onClick={onLogin}
              disabled={verifying}
            >
              {verifying ? <><Spinner size={12} /> Waiting</> : 'Sign in'}
            </button>
          )}
        </div>
      </div>
    </aside>
  )
}
