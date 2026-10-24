import { useState, type FormEvent } from 'react'
import type { ClientSession, PersistentTunnel } from '../../lib/api'
import { ROOT_DOMAIN, tierOf, upgradeUrl } from '../../lib/api'
import { normalizeSubdomain } from '../../lib/utils'

type Props = {
  session: ClientSession | null
  tunnels: PersistentTunnel[]
  tunnelNames: Record<string, string>
  onAddAddress: (name: string) => Promise<boolean>
  onRemoveAddress: (name: string) => void
  domainInput: string
  setDomainInput: (v: string) => void
  onDomainSubmit: (e: FormEvent<HTMLFormElement>) => void
  isBusy: boolean
}

const ADDRESS_PATTERN = /^[a-z0-9](?:[a-z0-9-]{1,30}[a-z0-9])?$/

export default function DomainsPage({
  session, tunnels, tunnelNames, onAddAddress, onRemoveAddress,
  domainInput, setDomainInput, onDomainSubmit, isBusy,
}: Props) {
  const [showAddCustom, setShowAddCustom] = useState(false)
  const [copied, setCopied] = useState<string | null>(null)
  const [newAddress, setNewAddress] = useState('')
  const [addError, setAddError] = useState('')
  const [adding, setAdding] = useState(false)
  const tier = session ? tierOf(session) : 'anonymous'
  const isPro = tier === 'pro' || tier === 'pro_plus'
  const addresses = session?.domains ?? []

  const shareUsing = (name: string) => tunnels.find(tunnel => tunnel.subdomain === name)

  const copyLink = (host: string) => {
    void navigator.clipboard.writeText(`https://${host}`).then(() => {
      setCopied(host)
      window.setTimeout(() => setCopied(current => (current === host ? null : current)), 1600)
    })
  }

  const submitAddress = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const name = normalizeSubdomain(newAddress)
    if (!ADDRESS_PATTERN.test(name)) {
      setAddError('Use 3–32 lowercase letters, numbers or dashes.')
      return
    }
    setAddError('')
    setAdding(true)
    try {
      if (await onAddAddress(name)) setNewAddress('')
    } finally {
      setAdding(false)
    }
  }

  return (
    <div className="ps-main">
      <div className="ps-page-header animate-fade-down">
        <div>
          <h1 className="ps-page-title">Domains</h1>
          <p className="ps-page-subtitle">Addresses you own. Each share uses one of them.</p>
        </div>
        {isPro && (
          <div className="ps-header-actions">
            <button className="ps-btn ps-btn-secondary ps-btn-sm" onClick={() => setShowAddCustom(true)}>
              Add custom domain
            </button>
          </div>
        )}
      </div>

      <div className="ps-page-content">
        <div className="ps-card animate-fade-up">
          <form className="ps-address-form" onSubmit={e => void submitAddress(e)}>
            <div className="ps-address-form-row">
              <div className="ps-input-group">
                <input
                  className="ps-input ps-input-mono"
                  value={newAddress}
                  onChange={e => { setNewAddress(e.target.value.toLowerCase()); setAddError('') }}
                  placeholder="my-app"
                  aria-label="New address"
                  aria-invalid={Boolean(addError)}
                />
                <span className="ps-input-suffix">.{ROOT_DOMAIN}</span>
              </div>
              <button type="submit" className="ps-btn ps-btn-primary" disabled={adding || !newAddress.trim()}>
                {adding ? 'Adding…' : 'Add address'}
              </button>
            </div>
            {addError
              ? <p className="ps-ns-error" role="alert">{addError}</p>
              : <p className="field-help">Pick a name people will recognise. You can use it for any share.</p>}
          </form>

          {addresses.length === 0 ? (
            <div className="ps-empty">
              <span className="ps-empty-title">No addresses yet</span>
              <span className="ps-empty-sub">Add one above, then use it when you create a share.</span>
            </div>
          ) : (
            addresses.map(name => {
              const host = `${name}.${ROOT_DOMAIN}`
              const share = shareUsing(name)
              return (
                <div key={name} className="ps-domain-item">
                  <div className="ps-domain-info">
                    <div className="ps-domain-name">{host}</div>
                    <div className="ps-domain-sub">
                      {share
                        ? `Used by ${tunnelNames[share.id] || (share.tunnelType === 'folder' ? 'a folder share' : `localhost:${share.port}`)}`
                        : 'Not used by any share'}
                    </div>
                  </div>
                  <span className={`ps-badge ${share ? 'ps-badge-green' : 'ps-badge-gray'}`}>{share ? 'In use' : 'Free'}</span>
                  <div className="ps-domain-actions">
                    <button className="ps-btn ps-btn-ghost ps-btn-sm" onClick={() => copyLink(host)}>
                      {copied === host ? 'Copied' : 'Copy link'}
                    </button>
                    <button
                      className="ps-btn ps-btn-ghost ps-btn-sm ps-btn-text-danger"
                      onClick={() => onRemoveAddress(name)}
                      disabled={isBusy || Boolean(share)}
                      title={share ? 'Delete the share that uses this address first' : undefined}
                    >
                      Remove
                    </button>
                  </div>
                </div>
              )
            })
          )}
        </div>

        {session?.customDomain && (
          <div className="ps-card animate-fade-up delay-100">
            <div className="ps-domain-item">
              <div className="ps-domain-info">
                <div className="ps-domain-name">{session.customDomain}</div>
                <div className="ps-domain-sub">Custom domain</div>
              </div>
              <span className="ps-badge ps-badge-yellow">Waiting for DNS</span>
              <div className="ps-domain-actions">
                <button className="ps-btn ps-btn-ghost ps-btn-sm" onClick={() => copyLink(session.customDomain)}>
                  {copied === session.customDomain ? 'Copied' : 'Copy link'}
                </button>
              </div>
            </div>
            <div className="ps-domains-section" style={{ borderTop: '1px solid var(--border)' }}>
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
          <div
            className="ps-modal ps-confirm"
            role="dialog"
            aria-modal="true"
            aria-labelledby="custom-domain-title"
            onClick={e => e.stopPropagation()}
            onKeyDown={e => { if (e.key === 'Escape') setShowAddCustom(false) }}
          >
            <form onSubmit={e => { onDomainSubmit(e); setShowAddCustom(false) }}>
              <div className="ps-confirm-body">
                <h2 className="ps-confirm-title" id="custom-domain-title">Add custom domain</h2>
                <p className="ps-confirm-message">Use a domain you own, like app.yourcompany.com.</p>
                <div className="ps-ns-field" style={{ marginTop: 8 }}>
                  <label className="ps-label" htmlFor="custom-domain-input">Domain</label>
                  <input
                    id="custom-domain-input"
                    className="ps-input ps-input-mono"
                    value={domainInput}
                    onChange={e => setDomainInput(e.target.value.toLowerCase())}
                    placeholder="app.yourdomain.com"
                    autoFocus
                  />
                  <p className="field-help">
                    Then add a CNAME record pointing to <code>{session?.subdomain}.{ROOT_DOMAIN}</code>.
                  </p>
                </div>
              </div>
              <div className="ps-confirm-footer">
                <button type="button" className="ps-btn ps-btn-secondary" onClick={() => setShowAddCustom(false)}>Cancel</button>
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
