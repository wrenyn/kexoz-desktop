import { useState, type FormEvent } from 'react'
import { Globe, Plus, Copy, X, Sparkles } from 'lucide-react'
import type { ClientSession } from '../../lib/api'
import { ROOT_DOMAIN } from '../../lib/api'

type Props = {
  session: ClientSession | null
  domainInput: string
  setDomainInput: (v: string) => void
  onDomainSubmit: (e: FormEvent<HTMLFormElement>) => void
  isBusy: boolean
}

type DomainEntry = {
  id: string
  name: string
  type: 'subdomain' | 'custom'
  status: 'active' | 'pending' | 'error'
  target: string
}

const statusBadge = {
  active:  'ps-badge-green',
  pending: 'ps-badge-yellow',
  error:   'ps-badge-red',
}

export default function DomainsPage({ session, domainInput, setDomainInput, onDomainSubmit, isBusy }: Props) {
  const [showAddCustom, setShowAddCustom] = useState(false)

  const domains: DomainEntry[] = [
    ...(session?.subdomain ? [{
      id: 'sub',
      name: `${session.subdomain}.${ROOT_DOMAIN}`,
      type: 'subdomain' as const,
      status: 'active' as const,
      target: `localhost:${session.port ?? 3000}`,
    }] : []),
    ...(session?.customDomain ? [{
      id: 'custom',
      name: session.customDomain,
      type: 'custom' as const,
      status: 'pending' as const,
      target: `${session.subdomain}.${ROOT_DOMAIN}`,
    }] : []),
  ]

  return (
    <div className="ps-main">
      <div className="ps-page-header animate-fade-down">
        <div>
          <h1 className="ps-page-title">Domains</h1>
          <p className="ps-page-subtitle">Subdomains and custom domains for this client</p>
        </div>
        <div className="ps-header-actions">
          <button className="ps-btn ps-btn-primary ps-btn-sm" onClick={() => setShowAddCustom(true)}>
            <Plus size={13} style={{ marginRight: 4 }} />
            Add custom domain
          </button>
        </div>
      </div>

      <div className="ps-page-content">
        {/* Domain list */}
        <div className="ps-card animate-fade-up">
          {domains.length === 0 ? (
            <div className="ps-empty">
              <Globe size={32} style={{ color: 'var(--text-muted)', marginBottom: 12 }} />
              <span className="ps-empty-title">No domains configured</span>
              <span className="ps-empty-sub">Your Kexoz subdomain will appear here once you connect a tunnel.</span>
            </div>
          ) : (
            domains.map(domain => (
              <div key={domain.id} className="ps-domain-item">
                <div className="ps-domain-info">
                  <div className="ps-domain-name">{domain.name}</div>
                  <div className="ps-domain-sub">
                    {domain.type === 'subdomain'
                      ? `Kexoz subdomain · forwarding to ${domain.target}`
                      : `Custom domain → ${domain.target}`}
                  </div>
                </div>
                <span className={`ps-badge ${statusBadge[domain.status]}`}>
                  {domain.status === 'active' ? 'Active' : domain.status === 'pending' ? 'Pending DNS' : 'Error'}
                </span>
                <div className="ps-domain-actions">
                  <button
                    className="ps-btn ps-btn-ghost ps-btn-sm"
                    onClick={() => void navigator.clipboard.writeText(`https://${domain.name}`)}
                  >
                    <Copy size={13} style={{ marginRight: 4 }} />
                    Copy URL
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* DNS instructions */}
        {session?.customDomain && (
          <div className="ps-card animate-fade-up delay-100" style={{ padding: '16px 20px' }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>
              DNS Configuration
            </div>
            <p style={{ fontSize: 12.5, color: 'var(--text-soft)', marginBottom: 12, lineHeight: 1.6 }}>
              Add this CNAME record to your DNS provider to activate your custom domain.
              Propagation can take up to 48 hours.
            </p>
            <div className="ps-code">
              <div style={{ display: 'grid', gridTemplateColumns: 'auto auto 1fr', gap: '0 24px' }}>
                <span style={{ color: 'var(--text-soft)' }}>Type</span>
                <span style={{ color: 'var(--text-soft)' }}>Name</span>
                <span style={{ color: 'var(--text-soft)' }}>Value</span>
                <span style={{ color: 'var(--cyan)' }}>CNAME</span>
                <span style={{ color: 'var(--text)' }}>{session.customDomain.split('.')[0]}</span>
                <span style={{ color: 'var(--text-accent)' }}>{session.subdomain}.{ROOT_DOMAIN}</span>
              </div>
            </div>
          </div>
        )}

        {/* Info card for Pro feature */}
        <div className="ps-card animate-fade-up delay-150" style={{ padding: '16px 20px' }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
            <Sparkles size={14} style={{ color: 'var(--text-accent)' }} />
            Custom domains require Pro
          </div>
          <p style={{ fontSize: 12, color: 'var(--text-soft)', lineHeight: 1.6 }}>
            Map any domain you own to your Kexoz tunnel — no server needed.
            Upgrade to Pro to enable custom domain mapping with automatic CNAME routing.
          </p>
        </div>
      </div>

      {/* Add custom domain modal */}
      {showAddCustom && (
        <div className="ps-modal-overlay" onClick={() => setShowAddCustom(false)}>
          <div className="ps-modal" onClick={e => e.stopPropagation()}>
            <div className="ps-modal-header">
              <span className="ps-modal-title">Add custom domain</span>
              <button className="ps-btn ps-btn-ghost ps-btn-sm" onClick={() => setShowAddCustom(false)} style={{ padding: 4 }}>
                <X size={14} />
              </button>
            </div>
            <form onSubmit={e => { onDomainSubmit(e); setShowAddCustom(false) }}>
              <div className="ps-modal-body">
                <div className="ps-input-wrap">
                  <label className="ps-label">Domain name</label>
                  <input
                    className="ps-input"
                    value={domainInput}
                    onChange={e => setDomainInput(e.target.value.toLowerCase())}
                    placeholder="tunnel.yourdomain.com"
                    autoFocus
                  />
                </div>
                <div className="ps-code" style={{ fontSize: 11.5, lineHeight: 1.8 }}>
                  <div style={{ marginBottom: 6, color: 'var(--text-soft)' }}>After adding, create this DNS record:</div>
                  <div><span style={{ color: 'var(--text-muted)' }}>Type:</span> CNAME</div>
                  <div><span style={{ color: 'var(--text-muted)' }}>Target:</span> {session?.subdomain}.{ROOT_DOMAIN}</div>
                </div>
              </div>
              <div className="ps-modal-footer">
                <button type="button" className="ps-btn ps-btn-ghost" onClick={() => setShowAddCustom(false)}>Cancel</button>
                <button type="submit" className="ps-btn ps-btn-primary" disabled={isBusy || !domainInput.trim()}>
                  Add domain
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
