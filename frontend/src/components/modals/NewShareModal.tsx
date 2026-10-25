import { useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react'
import { QUICK_PORTS } from '../../lib/storage'
import { ROOT_DOMAIN, type ShareAccess, type SharePermissions, type TunnelType } from '../../lib/api'
import { DEFAULT_FOLDER_EXCLUDES, EXPIRY_OPTIONS, isGatedType, parseExcludes, type FolderInfo, type NewShareRequest } from '../../lib/shares'
import { usePortScanner } from '../../hooks/usePortScanner'

const MIN_PASSWORD = 4

type Props = {
  onClose: () => void
  /** Addresses the user owns that no other share is using. */
  addresses: string[]
  onManageAddresses: () => void
  onSubmit: (request: NewShareRequest) => void | Promise<void>
}

type Kind = 'port' | 'terminal' | 'folder'
type Protocol = 'web' | 'tcp' | 'udp'
type ExpiryId = typeof EXPIRY_OPTIONS[number]['id']

const KINDS: { id: Kind; label: string }[] = [
  { id: 'port', label: 'Port' },
  { id: 'terminal', label: 'Terminal' },
  { id: 'folder', label: 'Folder' },
]

const KIND_HINTS: Record<Kind, string> = {
  port: 'A website, API or server running on this computer.',
  terminal: 'A terminal session people can use from their browser.',
  folder: 'Files people can browse and download.',
}

const PROTOCOLS: { id: Protocol; label: string }[] = [
  { id: 'web', label: 'Web' },
  { id: 'tcp', label: 'TCP' },
  { id: 'udp', label: 'UDP' },
]

const PROTOCOL_HINTS: Record<Protocol, string> = {
  web: 'Websites, APIs and WebSockets. Requests show up on the Requests page.',
  tcp: 'Databases, SSH, game servers and other raw connections.',
  udp: 'Voice, game and other datagram traffic.',
}

function Segmented<T extends string>({ label, options, value, onChange }: {
  label: string
  options: { id: T; label: string }[]
  value: T
  onChange: (value: T) => void
}) {
  return (
    <div className="ps-segmented" role="radiogroup" aria-label={label}>
      {options.map(option => (
        <button
          key={option.id}
          type="button"
          role="radio"
          aria-checked={value === option.id}
          className={`ps-segmented-item ${value === option.id ? 'active' : ''}`}
          onClick={() => onChange(option.id)}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

function ToggleRow({ title, desc, checked, onChange }: { title: string; desc: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label className="ps-ns-toggle-row">
      <span className="ps-ns-toggle-text">
        <span className="ps-ns-toggle-title">{title}</span>
        <span className="ps-ns-toggle-desc">{desc}</span>
      </span>
      <span className="ps-toggle">
        <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} />
        <span className="ps-toggle-track" />
      </span>
    </label>
  )
}

function Field({ label, htmlFor, aside, help, error, children }: {
  label: string
  htmlFor?: string
  aside?: ReactNode
  help?: ReactNode
  error?: string
  children: ReactNode
}) {
  return (
    <div className="ps-ns-field">
      <div className="ps-ns-field-head">
        {htmlFor ? <label className="ps-label" htmlFor={htmlFor}>{label}</label> : <span className="ps-label">{label}</span>}
        {aside}
      </div>
      {children}
      {error ? <p className="ps-ns-error" role="alert">{error}</p> : help ? <p className="field-help">{help}</p> : null}
    </div>
  )
}

export default function NewShareModal({ onClose, onSubmit, addresses, onManageAddresses }: Props) {
  const [kind, setKind] = useState<Kind>('port')
  const [address, setAddress] = useState(addresses[0] ?? '')
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
  const [attempted, setAttempted] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [pickError, setPickError] = useState('')
  const modalRef = useRef<HTMLDivElement>(null)
  const detectedPorts = usePortScanner(kind === 'port')

  const tunnelType: TunnelType =
    kind === 'folder' ? 'folder' :
    kind === 'terminal' ? 'pty' :
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
  const needsPassword = gated && access === 'private'

  const portNumber = Number(port)
  const addressError = address ? '' : 'Choose an address for the link.'
  const portError = kind === 'folder' ? '' : port.trim() === ''
    ? 'Enter the port your app is running on.'
    : !Number.isInteger(portNumber) || portNumber < 1 || portNumber > 65535
      ? 'Use a port between 1 and 65535.'
      : ''
  const folderError = kind !== 'folder' ? '' : !folder
    ? 'Choose a folder to share.'
    : broadFolder && !broadConfirmed
      ? 'Confirm you want to share this whole location.'
      : ''
  const passwordError = !needsPassword ? '' : !password.trim()
    ? 'Set a password for this private share.'
    : [...password].length < MIN_PASSWORD
      ? `Use at least ${MIN_PASSWORD} characters.`
      : ''
  const firstError = addressError || portError || folderError || passwordError
  const show = (error: string) => (attempted ? error : '')

  const switchKind = (next: Kind) => {
    setKind(next)
    setReadOnly(false)
    setAttempted(false)
  }

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
      setPickError('Folder sharing works in the Kexoz desktop app.')
      return
    }
    try {
      const picked = await window.kexoz.pickFolder()
      if (!picked) return
      if (!picked.isDirectory) {
        setPickError('That is a file, not a folder.')
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
    if (firstError) {
      requestAnimationFrame(() => {
        modalRef.current?.querySelector('.ps-ns-error')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
      })
      return
    }
    if (submitting) return
    setSubmitting(true)
    try {
      await onSubmit({
        subdomain: address,
        tunnelType,
        port: kind === 'folder' ? 0 : portNumber,
        access,
        permissions,
        password: needsPassword ? password : undefined,
        duration: EXPIRY_OPTIONS.find(option => option.id === expiry)?.duration || undefined,
        folder: kind === 'folder' && folder ? { root: folder.path, excludes: parseExcludes(excludesText) } : undefined,
      })
    } finally {
      setSubmitting(false)
    }
  }

  const accessHint =
    tunnelType === 'pty' ? 'Terminals are always private. Only people with the password can open it.' :
    !gated ? 'Kexoz can’t check visitors on this kind of connection, so anyone with the address can connect. Protect the service itself.' :
    access === 'public' ? 'Anyone with the link can open it.' :
    'Only people with the password can open it.'

  return (
    <div className="ps-modal-overlay" onClick={onClose}>
      <div
        className="ps-modal ps-ns"
        role="dialog"
        aria-modal="true"
        aria-labelledby="new-share-title"
        ref={modalRef}
        onClick={e => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        <div className="ps-ns-header">
          <div>
            <h2 className="ps-modal-title" id="new-share-title">New share</h2>
            <p className="ps-ns-subtitle">{KIND_HINTS[kind]}</p>
          </div>
          <button type="button" className="ps-btn ps-btn-ghost ps-btn-sm" onClick={onClose}>Close</button>
        </div>

        <div className="ps-ns-body">
          <Segmented label="What to share" options={KINDS} value={kind} onChange={switchKind} />

          <Field
            label="Address"
            htmlFor="new-share-address"
            aside={<button type="button" className="ps-ns-link" onClick={onManageAddresses}>Manage addresses</button>}
            error={addresses.length > 0 ? show(addressError) : undefined}
          >
            {addresses.length > 0 ? (
              <div className="ps-input-group">
                <span className="ps-input-prefix">https://</span>
                <select
                  id="new-share-address"
                  className="ps-ns-select"
                  value={address}
                  onChange={e => setAddress(e.target.value)}
                >
                  {addresses.map(name => (
                    <option key={name} value={name}>{name}.{ROOT_DOMAIN}</option>
                  ))}
                </select>
              </div>
            ) : (
              <div className="ps-ns-notice">
                <span>All of your addresses are in use. Add another one on the Domains page.</span>
                <button type="button" className="ps-btn ps-btn-secondary ps-btn-sm" onClick={onManageAddresses}>Add address</button>
              </div>
            )}
          </Field>

          {kind === 'port' && (
            <>
              <Field label="Port" htmlFor="new-share-port" error={show(portError)}>
                <div className="ps-input-group">
                  <span className="ps-input-prefix">localhost:</span>
                  <input
                    id="new-share-port"
                    className="ps-input ps-input-mono"
                    type="number"
                    value={port}
                    onChange={e => setPort(e.target.value)}
                    placeholder="3000"
                    min={1}
                    max={65535}
                    autoFocus
                    onKeyDown={e => { if (e.key === 'Enter') void handleSubmit() }}
                    aria-invalid={attempted && Boolean(portError)}
                  />
                </div>
                <div className="ps-ns-ports">
                  {detectedPorts.length > 0 && <span className="ps-ns-ports-label">Running now</span>}
                  {detectedPorts.map(detected => (
                    <button
                      key={detected.port}
                      type="button"
                      className={`ps-ns-port detected ${portNumber === detected.port ? 'active' : ''}`}
                      onClick={() => setPort(String(detected.port))}
                      title={detected.label}
                    >
                      {detected.port}
                    </button>
                  ))}
                  <span className="ps-ns-ports-label">{detectedPorts.length > 0 ? 'Common' : 'Common ports'}</span>
                  {QUICK_PORTS.filter(p => !detectedPorts.some(detected => detected.port === p)).map(p => (
                    <button
                      key={p}
                      type="button"
                      className={`ps-ns-port ${portNumber === p ? 'active' : ''}`}
                      onClick={() => setPort(String(p))}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </Field>

              <Field label="Connection" help={PROTOCOL_HINTS[protocol]}>
                <Segmented
                  label="Connection type"
                  options={PROTOCOLS}
                  value={protocol}
                  onChange={next => { setProtocol(next); setEndToEnd(false); setReadOnly(false) }}
                />
              </Field>

              {protocol === 'tcp' && (
                <div className="ps-ns-toggles">
                  <ToggleRow
                    title="End-to-end encryption"
                    desc="Encrypted traffic passes through to your service untouched."
                    checked={endToEnd}
                    onChange={setEndToEnd}
                  />
                </div>
              )}
            </>
          )}

          {kind === 'terminal' && (
            <>
              <Field
                label="Terminal port"
                htmlFor="new-share-port"
                help="The port your terminal server listens on. ttyd uses 7681."
                error={show(portError)}
              >
                <div className="ps-input-group">
                  <span className="ps-input-prefix">localhost:</span>
                  <input
                    id="new-share-port"
                    className="ps-input ps-input-mono"
                    type="number"
                    value={port}
                    onChange={e => setPort(e.target.value)}
                    placeholder="7681"
                    min={1}
                    max={65535}
                    autoFocus
                    onKeyDown={e => { if (e.key === 'Enter') void handleSubmit() }}
                    aria-invalid={attempted && Boolean(portError)}
                  />
                </div>
              </Field>
              <div className="ps-ns-toggles">
                <ToggleRow
                  title="View only"
                  desc="Visitors can watch but can’t type."
                  checked={readOnly}
                  onChange={setReadOnly}
                />
              </div>
            </>
          )}

          {kind === 'folder' && (
            <>
              <Field
                label="Folder"
                help={folder ? 'Everything inside, including subfolders, is shared.' : undefined}
                error={pickError || (broadFolder ? '' : show(folderError))}
              >
                <div className={`ps-ns-folder ${folder ? 'chosen' : ''}`}>
                  <span className="ps-ns-folder-path">{folder ? folder.path : 'No folder chosen'}</span>
                  <button type="button" className="ps-btn ps-btn-secondary ps-btn-sm" onClick={() => void chooseFolder()}>
                    {folder ? 'Change' : 'Choose folder'}
                  </button>
                </div>
              </Field>
              {broadFolder && folder && (
                <div className="ps-danger-warning" role="alert">
                  <span>
                    <strong>{folder.isDriveRoot ? 'This is a whole drive.' : 'This is your whole home folder.'}</strong>{' '}
                    It probably holds documents, passwords and app data. Pick a specific project folder instead.
                  </span>
                  <label className="ps-check" style={{ color: 'inherit' }}>
                    <input type="checkbox" checked={broadConfirmed} onChange={e => setBroadConfirmed(e.target.checked)} />
                    <span>I understand everything in {folder.path} will be reachable from this link.</span>
                  </label>
                </div>
              )}
              <Field label="Visitors can">
                <Segmented
                  label="Folder permission"
                  options={[{ id: 'read', label: 'View and download' }, { id: 'write', label: 'Also upload and delete' }]}
                  value={folderWritable ? 'write' : 'read'}
                  onChange={next => setFolderWritable(next === 'write')}
                />
              </Field>
              <Field
                label="Hide from visitors"
                htmlFor="new-share-excludes"
                help={<>One per line, like <code>*.log</code> or <code>private/</code>. Files like .env and private keys are always hidden.</>}
              >
                <textarea
                  id="new-share-excludes"
                  className="ps-input ps-input-mono"
                  rows={3}
                  value={excludesText}
                  onChange={e => setExcludesText(e.target.value)}
                  placeholder={'.git\nnode_modules\nprivate/'}
                />
              </Field>
            </>
          )}

          <Field label="Who can open it" help={accessHint}>
            {gated && tunnelType !== 'pty' && (
              <Segmented
                label="Access"
                options={[{ id: 'private', label: 'Private' }, { id: 'public', label: 'Public' }]}
                value={access}
                onChange={setChosenAccess}
              />
            )}
          </Field>

          {needsPassword && (
            <Field
              label="Password"
              htmlFor="new-share-password"
              help="Visitors enter this before the share opens. Send it to the people you want to let in."
              error={show(passwordError)}
            >
              <input
                id="new-share-password"
                className="ps-input"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') void handleSubmit() }}
                aria-invalid={attempted && Boolean(passwordError)}
              />
            </Field>
          )}

          <Field label="Stop sharing after">
            <Segmented
              label="Expiry"
              options={EXPIRY_OPTIONS.map(option => ({ id: option.id, label: option.label }))}
              value={expiry}
              onChange={setExpiry}
            />
          </Field>

        </div>

        <div className="ps-ns-footer">
          <button type="button" className="ps-btn ps-btn-ghost" onClick={onClose}>Cancel</button>
          <button
            type="button"
            className="ps-btn ps-btn-primary"
            onClick={() => void handleSubmit()}
            disabled={submitting || addresses.length === 0}
          >
            {submitting ? 'Starting…' : 'Start sharing'}
          </button>
        </div>
      </div>
    </div>
  )
}
