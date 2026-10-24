import { useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { AlertTriangle, FolderOpen } from 'lucide-react'
import { QUICK_PORTS } from '../../lib/storage'
import { ROOT_DOMAIN, type ShareAccess, type SharePermissions, type Tier, type TunnelType } from '../../lib/api'
import { DEFAULT_FOLDER_EXCLUDES, EXPIRY_OPTIONS, isGatedType, parseExcludes, type FolderInfo, type NewShareRequest } from '../../lib/shares'
import { usePortScanner } from '../../hooks/usePortScanner'

type Props = {
  onClose: () => void
  tier: Tier
  onSubmit: (request: NewShareRequest) => void | Promise<void>
}

type Tab = 'port' | 'terminal' | 'folder'
type Protocol = 'web' | 'tcp' | 'udp'
type ExpiryId = typeof EXPIRY_OPTIONS[number]['id']

const TABS: { id: Tab; label: string }[] = [
  { id: 'port', label: 'Port' },
  { id: 'terminal', label: 'Terminal' },
  { id: 'folder', label: 'Folder' },
]

const PROTOCOLS: { id: Protocol; label: string; desc: string }[] = [
  { id: 'web', label: 'Web', desc: 'HTTP, HTTPS, WebSocket' },
  { id: 'tcp', label: 'TCP', desc: 'Databases, SSH, games' },
  { id: 'udp', label: 'UDP', desc: 'Datagram services' },
]

const SUBDOMAIN_PATTERN = /^[a-z0-9](?:[a-z0-9-]{1,30}[a-z0-9])?$/

function randomSubdomain(): string {
  const adjectives = ['blue', 'fast', 'quick', 'neat', 'cool', 'tiny', 'smart', 'wavy', 'wild', 'happy']
  const nouns = ['fox', 'bear', 'wolf', 'cat', 'owl', 'duck', 'frog', 'lion', 'bird', 'fish']
  const pick = (list: string[]) => list[Math.floor(Math.random() * list.length)]
  return `${pick(adjectives)}-${pick(nouns)}-${Math.floor(Math.random() * 1000)}`
}

function Choice({ selected, title, desc, onClick, disabled }: { selected: boolean; title: string; desc: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      disabled={disabled}
      className={`ps-btn ps-choice ${selected ? 'ps-btn-primary' : 'ps-btn-secondary'}`}
      onClick={onClick}
    >
      <span className="ps-choice-title">{title}</span>
      <span className="ps-choice-desc">{desc}</span>
    </button>
  )
}

export default function NewShareModal({ onClose, onSubmit, tier }: Props) {
  const [tab, setTab] = useState<Tab>('port')
  const [subdomain, setSubdomain] = useState(randomSubdomain)
  const [port, setPort] = useState('')
  const [protocol, setProtocol] = useState<Protocol>('web')
  const [endToEnd, setEndToEnd] = useState(false)
  const [chosenAccess, setChosenAccess] = useState<ShareAccess>('private')
  const [readOnly, setReadOnly] = useState(false)
  const [folder, setFolder] = useState<FolderInfo | null>(null)
  const [folderWritable, setFolderWritable] = useState(false)
  const [excludesText, setExcludesText] = useState(DEFAULT_FOLDER_EXCLUDES.join('\n'))
  const [broadConfirmed, setBroadConfirmed] = useState(false)
  const [password, setPassword] = useState('')
  const [expiry, setExpiry] = useState<ExpiryId>('never')
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [attempted, setAttempted] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [pickError, setPickError] = useState('')
  const modalRef = useRef<HTMLDivElement>(null)
  const detectedPorts = usePortScanner(tab !== 'folder')

  const tunnelType: TunnelType =
    tab === 'folder' ? 'folder' :
    tab === 'terminal' ? 'pty' :
    protocol === 'udp' ? 'udp' :
    endToEnd ? 'e2e' :
    protocol === 'tcp' ? 'tcp' :
    'http'

  const gated = isGatedType(tunnelType)
  const access: ShareAccess = tunnelType === 'pty' ? 'private' : gated ? chosenAccess : 'public'
  const permissions: SharePermissions =
    tunnelType === 'folder' ? (folderWritable ? 'read-write' : 'read') :
    (tunnelType === 'http' || tunnelType === 'pty') && readOnly ? 'read' :
    'read-write'
  const broadFolder = Boolean(folder && (folder.isDriveRoot || folder.isHome))
  const needsPassword = access === 'private' && tier === 'anonymous' && tunnelType !== 'pty'

  const name = subdomain.trim().toLowerCase()
  const portNumber = Number(port)
  const subdomainError = !name
    ? 'Choose the public address visitors will use.'
    : !SUBDOMAIN_PATTERN.test(name)
      ? 'Use 3–32 lowercase letters, numbers or dashes.'
      : ''
  const portError = tab === 'folder' ? '' : port.trim() === ''
    ? 'Enter the local port your app is listening on.'
    : !Number.isInteger(portNumber) || portNumber < 1 || portNumber > 65535
      ? 'Port must be a whole number between 1 and 65535.'
      : ''
  const folderError = tab !== 'folder' ? '' : !folder
    ? 'Choose the folder to share.'
    : broadFolder && !broadConfirmed
      ? 'Confirm that you want to share this entire location.'
      : ''
  const passwordError = needsPassword && !password ? 'Guests need a password to keep a share private. Set one, or verify with Google.' : ''
  const firstError = subdomainError || portError || folderError || passwordError

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.stopPropagation()
      onClose()
      return
    }
    if (event.key !== 'Tab' || !modalRef.current) return
    const focusable = modalRef.current.querySelectorAll<HTMLElement>(
      'button:not([disabled]), input:not([disabled]), select, textarea, [href], [tabindex]:not([tabindex="-1"])'
    )
    if (focusable.length === 0) return
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  }

  const chooseFolder = async () => {
    setPickError('')
    if (!window.kexoz?.pickFolder) {
      setPickError('Folder sharing needs the Kexoz desktop app.')
      return
    }
    try {
      const picked = await window.kexoz.pickFolder()
      if (!picked) return
      if (!picked.isDirectory) {
        setPickError('That location is not a folder.')
        return
      }
      setFolder(picked)
      setBroadConfirmed(false)
    } catch (err) {
      setPickError(err instanceof Error ? err.message : 'Could not open the folder picker.')
    }
  }

  const handleSubmit = async () => {
    setAttempted(true)
    if (firstError || submitting) return
    setSubmitting(true)
    try {
      await onSubmit({
        subdomain: name,
        tunnelType,
        port: tab === 'folder' ? 0 : portNumber,
        access,
        permissions,
        password: gated && password ? password : undefined,
        duration: EXPIRY_OPTIONS.find(option => option.id === expiry)?.duration || undefined,
        folder: tab === 'folder' && folder ? { root: folder.path, excludes: parseExcludes(excludesText) } : undefined,
      })
    } finally {
      setSubmitting(false)
    }
  }

  const resourceNoun = tab === 'folder' ? 'folder' : tab === 'terminal' ? 'terminal' : 'port'

  return (
    <div className="ps-modal-overlay" onClick={onClose}>
      <div
        className="ps-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="new-share-title"
        ref={modalRef}
        onClick={e => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        <div className="ps-modal-header">
          <span className="ps-modal-title" id="new-share-title">New share</span>
          <button className="ps-btn ps-btn-ghost ps-btn-sm" onClick={onClose} aria-label="Close dialog">✕</button>
        </div>
        <div className="ps-modal-body">
          <div className="ps-share-tabs" role="tablist" aria-label="What to share">
            {TABS.map(({ id, label }) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={tab === id}
                className={`ps-tab ${tab === id ? 'active' : ''}`}
                onClick={() => { setTab(id); setReadOnly(false); setAttempted(false) }}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="ps-input-wrap">
            <label className="ps-label" htmlFor="new-share-subdomain">Public address</label>
            <div className="ps-input-group">
              <input
                id="new-share-subdomain"
                className="ps-input ps-input-mono"
                value={subdomain}
                onChange={e => setSubdomain(e.target.value)}
                placeholder="my-app"
                autoFocus
                aria-invalid={attempted && Boolean(subdomainError)}
                aria-describedby={attempted && subdomainError ? 'new-share-subdomain-error' : undefined}
              />
              <span className="ps-input-suffix">.{ROOT_DOMAIN}</span>
            </div>
            {attempted && subdomainError && (
              <p className="field-help" id="new-share-subdomain-error" role="alert" style={{ color: 'var(--red)' }}>{subdomainError}</p>
            )}
          </div>

          {tab !== 'folder' && (
            <div className="ps-input-wrap">
              <label className="ps-label" htmlFor="new-share-port">{tab === 'terminal' ? 'Terminal agent port' : 'Local port'}</label>
              <div className="ps-input-group">
                <span className="ps-input-prefix">localhost:</span>
                <input
                  id="new-share-port"
                  className="ps-input ps-input-mono"
                  type="number"
                  value={port}
                  onChange={e => setPort(e.target.value)}
                  placeholder={tab === 'terminal' ? '7681' : '3000'}
                  min={1}
                  max={65535}
                  onKeyDown={e => { if (e.key === 'Enter') void handleSubmit() }}
                  aria-invalid={attempted && Boolean(portError)}
                  aria-describedby={attempted && portError ? 'new-share-port-error' : undefined}
                />
              </div>
              {attempted && portError && (
                <p className="field-help" id="new-share-port-error" role="alert" style={{ color: 'var(--red)' }}>{portError}</p>
              )}
              {tab === 'port' && (
                <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginTop: 6 }}>
                  {detectedPorts.length > 0 && (
                    <>
                      <span style={{ fontSize: 11, color: 'var(--text-soft)', display: 'flex', alignItems: 'center' }}>Active:</span>
                      {detectedPorts.map(dp => (
                        <button
                          key={dp.port}
                          type="button"
                          title={dp.label}
                          className={`ps-btn ps-btn-sm ${Number(port) === dp.port ? 'ps-btn-primary' : 'ps-btn-secondary'}`}
                          onClick={() => setPort(String(dp.port))}
                          style={{ fontFamily: 'var(--mono-font)', fontSize: 11, borderColor: 'var(--green)', color: Number(port) === dp.port ? 'inherit' : 'var(--green)' }}
                        >
                          <span style={{ marginRight: 4 }}>●</span>
                          {dp.port}
                        </button>
                      ))}
                      <div style={{ width: 1, backgroundColor: 'var(--border)', margin: '0 4px' }} />
                    </>
                  )}
                  {QUICK_PORTS.filter(p => !detectedPorts.some(dp => dp.port === p)).map(p => (
                    <button
                      key={p}
                      type="button"
                      className={`ps-btn ps-btn-sm ${Number(port) === p ? 'ps-btn-primary' : 'ps-btn-secondary'}`}
                      onClick={() => setPort(String(p))}
                      style={{ fontFamily: 'var(--mono-font)', fontSize: 11 }}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {tab === 'port' && (
            <>
              <div className="ps-input-wrap">
                <label className="ps-label">Protocol</label>
                <div className="ps-choice-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
                  {PROTOCOLS.map(({ id, label, desc }) => (
                    <Choice key={id} selected={protocol === id} title={label} desc={desc} onClick={() => { setProtocol(id); setEndToEnd(false); setReadOnly(false) }} />
                  ))}
                </div>
              </div>
              {protocol !== 'udp' && (
                <div className="ps-input-wrap">
                  <label className="ps-label">Encryption</label>
                  <div className="ps-choice-grid">
                    <Choice
                      selected={!endToEnd}
                      title="Standard"
                      desc={protocol === 'web' ? 'TLS ends at the gateway; requests are inspectable' : 'Forward the raw stream'}
                      onClick={() => setEndToEnd(false)}
                    />
                    <Choice
                      selected={endToEnd}
                      title="End-to-end"
                      desc={protocol === 'web' ? 'TLS ends on your device; Kexoz cannot read traffic' : 'TLS passes through untouched'}
                      onClick={() => { setEndToEnd(true); setReadOnly(false) }}
                    />
                  </div>
                </div>
              )}
              {tunnelType === 'http' && (
                <label className="ps-check">
                  <input type="checkbox" checked={readOnly} onChange={e => setReadOnly(e.target.checked)} />
                  <span><strong>Read-only.</strong> Visitors can only view (GET/HEAD); form posts, uploads and WebSockets are blocked.</span>
                </label>
              )}
            </>
          )}

          {tab === 'terminal' && (
            <label className="ps-check">
              <input type="checkbox" checked={readOnly} onChange={e => setReadOnly(e.target.checked)} />
              <span><strong>View-only.</strong> Visitors watch the terminal but their keystrokes are ignored.</span>
            </label>
          )}

          {tab === 'folder' && (
            <>
              <div className="ps-input-wrap">
                <label className="ps-label">Folder</label>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <button type="button" className="ps-btn ps-btn-secondary ps-btn-sm" onClick={() => void chooseFolder()}>
                    <FolderOpen size={14} /> {folder ? 'Change folder' : 'Choose folder'}
                  </button>
                  {folder && <span className="ps-folder-path">{folder.path}</span>}
                </div>
                {pickError && <p className="field-help" role="alert" style={{ color: 'var(--red)' }}>{pickError}</p>}
                {attempted && folderError && !broadFolder && (
                  <p className="field-help" role="alert" style={{ color: 'var(--red)' }}>{folderError}</p>
                )}
                <p className="field-help">Everything inside is shared, including subfolders. Nothing outside it is ever reachable.</p>
              </div>
              {broadFolder && folder && (
                <div className="ps-danger-warning" role="alert">
                  <span>
                    <strong>{folder.isDriveRoot ? 'This is an entire drive.' : 'This is your whole home folder.'}</strong>{' '}
                    It likely holds documents, credentials and app data. Share a specific project folder instead.
                  </span>
                  <label className="ps-check" style={{ color: 'inherit' }}>
                    <input type="checkbox" checked={broadConfirmed} onChange={e => setBroadConfirmed(e.target.checked)} />
                    <span>I understand everything in {folder.path} will be reachable through this link.</span>
                  </label>
                </div>
              )}
              <div className="ps-input-wrap">
                <label className="ps-label">Permission</label>
                <div className="ps-choice-grid">
                  <Choice selected={!folderWritable} title="Read-only" desc="Browse, preview and download" onClick={() => setFolderWritable(false)} />
                  <Choice selected={folderWritable} title="Read & write" desc="Visitors can also upload and delete files" onClick={() => setFolderWritable(true)} />
                </div>
              </div>
              <div className="ps-input-wrap">
                <label className="ps-label" htmlFor="new-share-excludes">Hidden from visitors</label>
                <textarea
                  id="new-share-excludes"
                  className="ps-input ps-input-mono"
                  rows={3}
                  value={excludesText}
                  onChange={e => setExcludesText(e.target.value)}
                  placeholder={'.git\nnode_modules\nprivate/'}
                />
                <p className="field-help">
                  One pattern per line: a name like <code>*.log</code>, or a path like <code>private/</code> to lock a subfolder.
                  .env files, private keys and credential folders are always hidden.
                </p>
              </div>
            </>
          )}

          <div className="ps-input-wrap">
            <label className="ps-label">Access</label>
            {gated && tunnelType !== 'pty' ? (
              <div className="ps-choice-grid">
                <Choice
                  selected={access === 'private'}
                  title="Private"
                  desc={tier === 'anonymous' ? 'Visitors enter a password' : 'Visitors sign in with Google'}
                  onClick={() => setChosenAccess('private')}
                />
                <Choice selected={access === 'public'} title="Public" desc="Anyone with the link" onClick={() => setChosenAccess('public')} />
              </div>
            ) : (
              <div className="ps-share-meta">
                <span className={`ps-badge ${access === 'public' ? 'ps-badge-public' : 'ps-badge-private'}`}>{access}</span>
                <span className="field-help" style={{ margin: 0 }}>
                  {tunnelType === 'pty'
                    ? 'Terminals are always private: visitors must sign in with Google.'
                    : 'The gateway cannot check visitors on raw or end-to-end streams, so protect the service itself (passwords, TLS).'}
                </span>
              </div>
            )}
            {access === 'public' && (
              <div className="ps-exposure-warning" role="status">
                <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
                <span><strong>Anyone on the internet can reach this {resourceNoun}.</strong> Only share it if it is safe to be public, and consider an expiry.</span>
              </div>
            )}
            {needsPassword && (
              <p className="field-help">Google sign-in protection needs a verified account, so guests protect private shares with a password.</p>
            )}
          </div>

          <div className="ps-input-wrap">
            <label className="ps-label">Expires after</label>
            <div className="ps-choice-grid ps-choice-grid-4">
              {EXPIRY_OPTIONS.map(option => (
                <button
                  key={option.id}
                  type="button"
                  aria-pressed={expiry === option.id}
                  className={`ps-btn ps-btn-sm ${expiry === option.id ? 'ps-btn-primary' : 'ps-btn-secondary'}`}
                  onClick={() => setExpiry(option.id)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          {gated && (
            <div className="ps-input-wrap">
              {needsPassword ? null : (
                <button
                  type="button"
                  className="ps-btn ps-btn-ghost ps-btn-sm"
                  onClick={() => setShowAdvanced(!showAdvanced)}
                  style={{ alignSelf: 'flex-start', padding: 0, fontWeight: 500, color: 'var(--text-soft)' }}
                >
                  {showAdvanced ? 'Hide password option ▲' : 'Add a password ▼'}
                </button>
              )}
              {(showAdvanced || needsPassword) && (
                <>
                  <label className="ps-label" htmlFor="new-share-password">Password</label>
                  <input
                    id="new-share-password"
                    className="ps-input"
                    type="password"
                    placeholder="Visitors sign in with user “kexoz” and this password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    aria-invalid={attempted && Boolean(passwordError)}
                  />
                  {attempted && passwordError && (
                    <p className="field-help" role="alert" style={{ color: 'var(--red)' }}>{passwordError}</p>
                  )}
                  {password && access === 'public' && (
                    <p className="field-help">A password makes this share private.</p>
                  )}
                </>
              )}
            </div>
          )}
        </div>
        <div className="ps-modal-footer">
          <span className="field-help" style={{ flex: 1 }}>
            {attempted && firstError ? firstError : ''}
          </span>
          <button className="ps-btn ps-btn-ghost" onClick={onClose}>Cancel</button>
          <button className="ps-btn ps-btn-primary" onClick={() => void handleSubmit()} disabled={submitting}>
            {submitting ? 'Starting…' : 'Start sharing'}
          </button>
        </div>
      </div>
    </div>
  )
}
