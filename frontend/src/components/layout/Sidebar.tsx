import { LogOut, LogIn, ChevronLeft, ChevronRight } from 'lucide-react'
import { NAV_ITEMS, type Page } from '../../lib/navigation'
import Logo from '../ui/Logo'

type Props = {
  activePage: Page
  onNavigate: (page: Page) => void
  requestCount: number
  theme: 'light' | 'dark'
  onToggleTheme: () => void
  ownerEmail: string
  onLogin: () => void
  onLogout: () => void
  collapsed: boolean
  onToggleCollapse: () => void
}

export default function Sidebar({ activePage, onNavigate, requestCount, ownerEmail, onLogin, onLogout, collapsed, onToggleCollapse }: Props) {
  return (
    <aside className={`ps-sidebar animate-slide-left ${collapsed ? 'ps-sidebar-collapsed' : ''}`}>
      {/* Brand */}
      <div className="ps-sidebar-brand">
        <div className="ps-brand-icon">
          <Logo style={{ width: '100%', height: '100%' }} />
        </div>
        {!collapsed && (
          <div>
            <div className="ps-brand-name">Kexoz</div>
            <div className="ps-brand-version">Desktop</div>
          </div>
        )}
        <button
          type="button"
          className="ps-sidebar-collapse-btn"
          onClick={onToggleCollapse}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? <ChevronRight size={13} /> : <ChevronLeft size={13} />}
        </button>
      </div>

      {/* Navigation */}
      <nav className="ps-nav" style={{ flex: 1 }} aria-label="Primary">
        {NAV_ITEMS.map(({ id, label, icon: Icon, shortcut }) => (
          <button
            key={id}
            type="button"
            className={`ps-nav-item ${activePage === id ? 'active' : ''} ${collapsed ? 'ps-nav-item-collapsed' : ''}`}
            aria-current={activePage === id ? 'page' : undefined}
            title={collapsed ? `${label} (Ctrl+${shortcut})` : `${label} (Ctrl+${shortcut})`}
            onClick={() => onNavigate(id)}
          >
            <Icon size={16} className="ps-nav-icon" aria-hidden="true" />
            {!collapsed && label}
            {!collapsed && id === 'requests' && requestCount > 0 && (
              <span className="ps-nav-badge">{requestCount}</span>
            )}
            {collapsed && id === 'requests' && requestCount > 0 && (
              <span className="ps-nav-badge ps-nav-badge-dot" />
            )}
          </button>
        ))}
      </nav>

      {/* Account / Auth */}
      <div className="ps-sidebar-status" style={{ position: 'relative' }}>
        {ownerEmail ? (
          <div style={{ padding: '0 2px' }}>
            {!collapsed && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <div style={{
                  fontSize: 11,
                  color: 'var(--text-soft)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}>
                  {ownerEmail}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: 'var(--green)' }} title="Connected to Kexoz network">
                  <div style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: 'currentColor' }} />
                  Online
                </div>
              </div>
            )}
            <button
              className="ps-btn ps-btn-secondary ps-btn-sm"
              style={{ width: '100%', justifyContent: 'center' }}
              onClick={onLogout}
              title={collapsed ? 'Sign out' : undefined}
            >
              <LogOut size={13} style={{ marginRight: collapsed ? 0 : 6 }} />
              {!collapsed && 'Sign out'}
            </button>
          </div>
        ) : (
          <div style={{ padding: '0 2px' }}>
            {!collapsed && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', marginBottom: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: 'var(--green)' }} title="Connected to Kexoz network">
                  <div style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: 'currentColor' }} />
                  Online
                </div>
              </div>
            )}
            <button
              className="ps-btn ps-btn-secondary ps-btn-sm"
              style={{ width: '100%', justifyContent: 'center' }}
              onClick={onLogin}
              title={collapsed ? 'Sign in with Google' : undefined}
            >
              <LogIn size={13} style={{ marginRight: collapsed ? 0 : 6 }} />
              {!collapsed && 'Sign in with Google'}
            </button>
          </div>
        )}
      </div>
    </aside>
  )
}
