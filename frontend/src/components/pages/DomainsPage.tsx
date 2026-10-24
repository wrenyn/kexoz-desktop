import { useState, type FormEvent } from 'react'
import type { ClientSession } from '../../lib/api'
import { ROOT_DOMAIN, tierOf, upgradeUrl } from '../../lib/api'

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
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const tier = session ? tierOf(session) : 'anonymous'
  const isPro = tier === 'pro' || tier === 'pro_plus'

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

  const copyUrl = (domain: DomainEntry) => {
    void navigator.clipboard.writeText(`https://${domain.name}`).then(() => {
      setCopiedId(domain.id)
      window.setTimeout(() => setCopiedId(null), 1600)
    })
  }

  return (
    <div className="ps-main">
      <div className="ps-page-header animate-fade-down">
        <div>
          <h1 className="ps-page-title">Domains</h1>
          <p className="ps-page-subtitle">Where people can reach your shares</p>
        </div>
        {isPro && (
          <div className="ps-header-actions">
            <button className="ps-btn ps-btn-primary ps-btn-sm" onClick={() => setShowAddCustom(true)}>
              Add custom domain
            </button>
          </div>
        )}
      </div>

      <div className="ps-page-content">
        <div className="ps-card animate-fade-up">
          {domains.length === 0 ? (
            <div className="ps-empty">
              <span className="ps-empty-title">No domains yet</span>
              <span className="ps-empty-sub">Your Kexoz address shows up here once you pick one.</span>
            </div>
          ) : (
            domains.map(domain => (
              <div key={domain.id} className="ps-domain-item">
                <div className="ps-domain-info">
                  <div className="ps-domain-name">{domain.name}</div>
                  <div className="ps-domain-sub">
                    {domain.type === 'subdomain'
                      ? `Forwards to ${domain.target}`
                      : `Points to ${domain.target}`}
                  </div>
                </div>
                <span className={`ps-badge ${statusBadge[domain.status]}`}>
                  {domain.status === 'active' ? 'Active' : domain.status === 'pending' ? 'Waiting for DNS' : 'Error'}
                </span>
                <div className="ps-domain-actions">
                  <button className="ps-btn ps-btn-secondary ps-btn-sm" onClick={() => copyUrl(domain)}>
                    {copiedId === domain.id ? 'Copied' : 'Copy link'}
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {session?.customDomain && (
          <div className="ps-card ps-domains-section animate-fade-up delay-100">
            <div className="ps-domains-section-title">DNS record</div>
            <p className="ps-domains-section-text">
              Add this record at your DNS provider. It can take a few hours to start working.
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

        {!isPro && (
          <div className="ps-card ps-domains-section ps-domains-upsell animate-fade-up delay-150">
            <div>
              <div className="ps-domains-section-title">Use your own domain</div>
              <p className="ps-domains-section-text">Custom domains are part of Pro.</p>
            </div>
            {session && (
              <a
                className="ps-btn ps-btn-primary ps-btn-sm"
                href={upgradeUrl(session.id, 'pro')}
                target="_blank"
                rel="noreferrer"
              >
                Upgrade plan
              </a>
            )}
          </div>
        )}
      </div>

      {showAddCustom && (
        <div className="ps-modal-overlay" onClick={() => setShowAddCustom(false)}>
          <div className="ps-modal" onClick={e => e.stopPropagation()}>
            <div className="ps-modal-header">
              <span className="ps-modal-title">Add custom domain</span>
            </div>
            <form onSubmit={e => { onDomainSubmit(e); setShowAddCustom(false) }}>
              <div className="ps-modal-body">
                <div className="ps-input-wrap">
                  <label className="ps-label">Domain name</label>
                  <input
                    className="ps-input"
                    value={domainInput}
                    onChange={e => setDomainInput(e.target.value.toLowerCase())}
                    placeholder="app.yourdomain.com"
                    autoFocus
                  />
                </div>
                <div className="ps-code" style={{ fontSize: 11.5, lineHeight: 1.8 }}>
                  <div style={{ marginBottom: 6, color: 'var(--text-soft)' }}>Then add this DNS record:</div>
                  <div><span style={{ color: 'var(--text-muted)' }}>Type:</span> CNAME</div>
                  <div><span style={{ color: 'var(--text-muted)' }}>Value:</span> {session?.subdomain}.{ROOT_DOMAIN}</div>
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
