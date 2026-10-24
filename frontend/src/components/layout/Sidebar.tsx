import { NAV_ITEMS, type Page } from '../../lib/navigation'
import Logo from '../ui/Logo'

type Props = {
  activePage: Page
  onNavigate: (page: Page) => void
  requestCount: number
  ownerEmail: string
  onLogin: () => void
  verifying: boolean
}

export default function Sidebar({ activePage, onNavigate, requestCount, ownerEmail, onLogin, verifying }: Props) {
  return (
    <aside className="ps-sidebar animate-slide-left">
      <div className="ps-sidebar-brand">
        <div className="ps-brand-icon">
          <Logo style={{ width: '100%', height: '100%' }} />
        </div>
        <div className="ps-brand-name">Kexoz</div>
      </div>

      <nav className="ps-nav" aria-label="Primary">
        {NAV_ITEMS.map(({ id, label, shortcut }) => (
          <button
            key={id}
            type="button"
            className={`ps-nav-item ${activePage === id ? 'active' : ''}`}
            aria-current={activePage === id ? 'page' : undefined}
            title={`${label} (Ctrl+${shortcut})`}
            onClick={() => onNavigate(id)}
          >
            {label}
            {id === 'requests' && requestCount > 0 && (
              <span className="ps-nav-badge">{requestCount}</span>
            )}
          </button>
        ))}
      </nav>

      <div className="ps-sidebar-account">
        {ownerEmail ? (
          <>
            <div className="ps-account-avatar" aria-hidden="true">{ownerEmail.charAt(0)}</div>
            <div className="ps-account-info">
              <div className="ps-account-email" title={ownerEmail}>{ownerEmail}</div>
            </div>
          </>
        ) : (
          <div className="ps-account-guest">
            <div className="ps-account-email">Guest</div>
            <button type="button" className="ps-btn ps-btn-secondary ps-btn-sm" onClick={onLogin} disabled={verifying}>
              {verifying ? 'Check your browser…' : 'Sign in with Google'}
            </button>
          </div>
        )}
      </div>
    </aside>
  )
}
