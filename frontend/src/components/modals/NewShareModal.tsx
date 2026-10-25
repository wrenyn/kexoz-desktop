import { useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react'
import { QUICK_PORTS } from '../../lib/storage'
import { ROOT_DOMAIN, type ShareAccess, type SharePermissions, type TunnelType } from '../../lib/api'
import { DEFAULT_FOLDER_EXCLUDES, EXPIRY_OPTIONS, parseExcludes, type FolderInfo, type NewShareRequest } from '../../lib/shares'
import { usePortScanner } from '../../hooks/usePortScanner'

const MIN_PASSWORD = 4
const MAX_DOWNLOADS = 100000

type Props = {
  onClose: () => void
  /** Addresses the user owns that no other share is using. */
  addresses: string[]
  onManageAddresses: () => void
  onSubmit: (request: NewShareRequest) => void | Promise<void>
}

type Kind = 'port' | 'terminal' | 'folder'
type Protocol = 'web' | 'tcp' | 'udp'
type ExpiryId = typeof EXPIRY_OPTIONS[number]['id'] | 'custom'
type ExpiryUnit = 'm' | 'h' | 'd'

const EXPIRY_CHOICES: { id: ExpiryId; label: string }[] = [
  { id: 'never', label: 'Never' },
  ...EXPIRY_OPTIONS.filter(option => option.id !== 'never').map(option => ({ id: option.id, label: option.label })),
  { id: 'custom', label: 'Custom' },
]

const EXPIRY_UNITS: { id: ExpiryUnit; label: string; minutes: number }[] = [
  { id: 'm', label: 'Minutes', minutes: 1 },
  { id: 'h', label: 'Hours', minutes: 60 },
  { id: 'd', label: 'Days', minutes: 60 * 24 },
]

const MAX_EXPIRY_MINUTES = 365 * 24 * 60

const KINDS: { id: Kind; title: string; desc: string }[] = [
  { id: 'port', title: 'Port', desc: 'A website, API or server running on this computer, like localhost:3000.' },
  { id: 'terminal', title: 'Terminal', desc: 'Let someone use a terminal on this computer from their browser.' },
  { id: 'folder', title: 'Folder', desc: 'Let people browse and download files from a folder.' },
]

const TITLES: Record<Kind, string> = {
  port: 'Share a port',
  terminal: 'Share a terminal',
  folder: 'Share a folder',
}

const PROTOCOLS: { id: Protocol; label: string }[] = [
  { id: 'web', label: 'Website or API' },
  { id: 'tcp', label: 'TCP' },
  { id: 'udp', label: 'UDP' },
]

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
  const [kind, setKind] = useState<Kind | null>(null)
  const [address, setAddress] = useState(addresses[0] ?? '')
  const [port, setPort] = useState('')
  const [protocol, setProtocol] = useState<Protocol>('web')
  const [endToEnd, setEndToEnd] = useState(false)
  const [access, setAccess] = useState<ShareAccess>('private')
  const [preview, setPreview] = useState(false)
  const [viewOnly, setViewOnly] = useState(false)
  const [folder, setFolder] = useState<FolderInfo | null>(null)
  const [folderWritable, setFolderWritable] = useState(false)
  const [excludesText, setExcludesText] = useState(DEFAULT_FOLDER_EXCLUDES.join('\n'))
  const [downloadLimit, setDownloadLimit] = useState('')
  const [broadConfirmed, setBroadConfirmed] = useState(false)
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [expiry, setExpiry] = useState<ExpiryId>('never')
  const [customAmount, setCustomAmount] = useState('30')
  const [customUnit, setCustomUnit] = useState<ExpiryUnit>('m')
  const [moreOpen, setMoreOpen] = useState(false)
  const [attempted, setAttempted] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [pickError, setPickError] = useState('')
  const modalRef = useRef<HTMLDivElement>(null)
  const detectedPorts = usePortScanner(kind === 'port' || kind === 'terminal')

  const tunnelType: TunnelType =
    kind === 'folder' ? 'folder' :
    kind === 'terminal' ? 'pty' :
    protocol === 'udp' ? 'udp' :
    protocol === 'tcp' ? (endToEnd ? 'e2e' : 'tcp') :
    'http'

  const isWeb = tunnelType === 'http'
  const needsAddress = tunnelType !== 'tcp' && tunnelType !== 'udp'
  const gated = tunnelType === 'http' || tunnelType === 'pty' || tunnelType === 'folder'
  const effectiveAccess: ShareAccess = tunnelType === 'pty' ? 'private' : gated ? access : 'public'
  const permissions: SharePermissions =
    tunnelType === 'folder' ? (folderWritable ? 'read-write' : 'read') :
    tunnelType === 'pty' && viewOnly ? 'read' :
    'read-write'
  const broadFolder = Boolean(folder && (folder.isDriveRoot || folder.isHome))
  const needsPassword = gated && effectiveAccess === 'private'

  const portNumber = Number(port)
  const addressError = !needsAddress || address ? '' : 'Choose an address for the link.'
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
    ? 'Set a password. Visitors type it before the share opens.'
    : [...password].length < MIN_PASSWORD
      ? `Use at least ${MIN_PASSWORD} characters.`
      : ''
  const customNumber = Number(customAmount)
  const customMinutes = customNumber * (EXPIRY_UNITS.find(unit => unit.id === customUnit)?.minutes ?? 1)
  const expiryError = expiry !== 'custom' ? '' : !Number.isInteger(customNumber) || customNumber < 1
    ? 'Enter a whole number, like 30 or 2.'
    : customMinutes > MAX_EXPIRY_MINUTES
      ? 'Pick a time up to 365 days.'
      : ''
  const downloadNumber = Number(downloadLimit)
  const downloadError = kind !== 'folder' || downloadLimit.trim() === '' ? '' :
    !Number.isInteger(downloadNumber) || downloadNumber < 1 || downloadNumber > MAX_DOWNLOADS
      ? `Use a whole number from 1 to ${MAX_DOWNLOADS.toLocaleString()}, or leave it empty.`
      : ''
  const duration = expiry === 'custom'
    ? `${customMinutes}m`
    : EXPIRY_OPTIONS.find(option => option.id === expiry)?.duration || undefined
  const hiddenError = expiryError || downloadError
  const firstError = addressError || portError || folderError || passwordError || hiddenError
  const show = (error: string) => (attempted ? error : '')

  const pickKind = (next: Kind) => {
    setKind(next)
    setAttempted(false)
    setMoreOpen(false)
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
    if (!kind) return
    setAttempted(true)
    if (firstError) {
      if (hiddenError && !(addressError || portError || folderError || passwordError)) setMoreOpen(true)
      requestAnimationFrame(() => {
        modalRef.current?.querySelector('.ps-ns-error')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
      })
      return
    }
    if (submitting) return
    setSubmitting(true)
    try {
      await onSubmit({
        subdomain: needsAddress ? address : '',
        tunnelType,
        port: kind === 'folder' ? 0 : portNumber,
        access: effectiveAccess,
        permissions,
        password: needsPassword ? password : undefined,
        duration,
        preview: isWeb && preview,
        folder: kind === 'folder' && folder ? {
          root: folder.path,
          excludes: parseExcludes(excludesText),
          maxDownloads: downloadLimit.trim() ? downloadNumber : undefined,
        } : undefined,
      })
    } finally {
      setSubmitting(false)
    }
  }

  const onEnter = (e: ReactKeyboardEvent<HTMLInputElement>) => { if (e.key === 'Enter') void handleSubmit() }

  const portField = (label: string, placeholder: string, help?: string) => (
    <Field label={label} htmlFor="new-share-port" error={show(portError)} help={help}>
      <div className="ps-input-group">
        <span className="ps-input-prefix">localhost:</span>
        <input
          id="new-share-port"
          className="ps-input ps-input-mono"
          type="number"
          value={port}
          onChange={e => setPort(e.target.value)}
          placeholder={placeholder}
          min={1}
          max={65535}
          autoFocus
          onKeyDown={onEnter}
          aria-invalid={attempted && Boolean(portError)}
        />
      </div>
      {kind === 'port' && (
        <div className="ps-ns-ports">
          {detectedPorts.length > 0 ? (
            <>
              <span className="ps-ns-ports-label">Running now</span>
              {detectedPorts.map(detected => (
                <button
                  key={detected.port}
                  type="button"
                  className={`ps-ns-port detected ${portNumber === detected.port ? 'active' : ''}`}
                  onClick={() => setPort(String(detected.port))}
                  title={detected.label}
                >
                  {detected.port}
                  <span className="ps-ns-port-name">{detected.label}</span>
                </button>
              ))}
            </>
          ) : (
            <>
              <span className="ps-ns-ports-label">Common ports</span>
              {QUICK_PORTS.map(p => (
                <button
                  key={p}
                  type="button"
                  className={`ps-ns-port ${portNumber === p ? 'active' : ''}`}
                  onClick={() => setPort(String(p))}
                >
                  {p}
                </button>
              ))}
            </>
          )}
        </div>
      )}
    </Field>
  )

  const accessFields = gated && (
    <Field
      label="Who can open it"
      help={effectiveAccess === 'public' ? 'Anyone with the link can open it.' : undefined}
      error={needsPassword ? show(passwordError) : undefined}
    >
      {tunnelType !== 'pty' && (
        <Segmented
          label="Who can open it"
          options={[{ id: 'private', label: 'Only people with the password' }, { id: 'public', label: 'Anyone with the link' }]}
          value={access}
          onChange={setAccess}
        />
      )}
      {needsPassword && (
        <div className="ps-input-group">
          <input
            id="new-share-password"
            className="ps-input"
            type={showPassword ? 'text' : 'password'}
            autoComplete="new-password"
            placeholder="Password"
            aria-label="Password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            onKeyDown={onEnter}
            aria-invalid={attempted && Boolean(passwordError)}
          />
          <button type="button" className="ps-ns-reveal" onClick={() => setShowPassword(v => !v)}>
            {showPassword ? 'Hide' : 'Show'}
          </button>
        </div>
      )}
    </Field>
  )

  const expiryField = (
    <Field label="Stop sharing after" error={show(expiryError)}>
      <Segmented label="Stop sharing after" options={EXPIRY_CHOICES} value={expiry} onChange={setExpiry} />
      {expiry === 'custom' && (
        <div className="ps-input-group ps-ns-custom-expiry">
          <input
            className="ps-input ps-input-mono"
            type="number"
            min={1}
            value={customAmount}
            onChange={e => setCustomAmount(e.target.value)}
            onKeyDown={onEnter}
            aria-label="Stop sharing after"
            aria-invalid={attempted && Boolean(expiryError)}
            autoFocus
          />
          <select
            className="ps-ns-select ps-ns-unit"
            value={customUnit}
            onChange={e => setCustomUnit(e.target.value as ExpiryUnit)}
            aria-label="Unit"
          >
            {EXPIRY_UNITS.map(unit => (
              <option key={unit.id} value={unit.id}>{unit.label}</option>
            ))}
          </select>
        </div>
      )}
    </Field>
  )

  const addressField = (
    <Field
      label="Link"
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
          <span>All of your addresses are in use. Stop using one, or add another on the Domains page.</span>
          <button type="button" className="ps-btn ps-btn-secondary ps-btn-sm" onClick={onManageAddresses}>Domains</button>
        </div>
      )}
    </Field>
  )

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
          <h2 className="ps-modal-title" id="new-share-title">{kind ? TITLES[kind] : 'What do you want to share?'}</h2>
          <button type="button" className="ps-btn ps-btn-ghost ps-btn-sm" onClick={onClose}>Close</button>
        </div>

        {!kind ? (
          <div className="ps-ns-body">
            <div className="ps-ns-kinds">
              {KINDS.map((option, index) => (
                <button
                  key={option.id}
                  type="button"
                  className="ps-ns-kind"
                  onClick={() => pickKind(option.id)}
                  autoFocus={index === 0}
                >
                  <span className="ps-ns-kind-title">{option.title}</span>
                  <span className="ps-ns-kind-desc">{option.desc}</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <>
            <div className="ps-ns-body">
              {kind === 'port' && (
                <>
                  {portField('Port', '3000')}
                  <Field
                    label="Kind of traffic"
                    help={protocol === 'web' ? undefined : 'You get a public address and port. Anyone who has it can connect, so keep your own login on the service.'}
                  >
                    <Segmented
                      label="Kind of traffic"
                      options={PROTOCOLS}
                      value={protocol}
                      onChange={next => { setProtocol(next); setEndToEnd(false) }}
                    />
                  </Field>
                  {protocol === 'tcp' && (
                    <div className="ps-ns-toggles">
                      <ToggleRow
                        title="End-to-end encryption"
                        desc="For services that speak TLS. Traffic passes through to your service untouched and gets a link instead of a port."
                        checked={endToEnd}
                        onChange={setEndToEnd}
                      />
                    </div>
                  )}
                  {needsAddress && addressField}
                  {accessFields}
                  {isWeb && (
                    <div className="ps-ns-toggles">
                      <ToggleRow
                        title="Interactive preview"
                        desc="Visitors can click anywhere on the page to leave a note. You see the notes on the Feedback page."
                        checked={preview}
                        onChange={setPreview}
                      />
                    </div>
                  )}
                </>
              )}

              {kind === 'terminal' && (
                <>
                  {portField('Terminal port', '7681', 'The port your terminal server listens on. ttyd uses 7681.')}
                  {addressField}
                  {accessFields}
                  <div className="ps-ns-toggles">
                    <ToggleRow title="View only" desc="Visitors can watch but can’t type." checked={viewOnly} onChange={setViewOnly} />
                  </div>
                </>
              )}

              {kind === 'folder' && (
                <>
                  <Field
                    label="Folder"
                    help={folder ? 'Everything inside, including subfolders, is shared. Files like .env and private keys are always hidden.' : undefined}
                    error={pickError || (broadFolder ? '' : show(folderError))}
                  >
                    <div className={`ps-ns-folder ${folder ? 'chosen' : ''}`}>
                      <span className="ps-ns-folder-path">{folder ? folder.path : 'No folder chosen'}</span>
                      <button type="button" className="ps-btn ps-btn-secondary ps-btn-sm" onClick={() => void chooseFolder()} autoFocus>
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
                  {addressField}
                  <Field label="Visitors can">
                    <Segmented
                      label="Visitors can"
                      options={[{ id: 'read', label: 'View and download' }, { id: 'write', label: 'Also upload and delete' }]}
                      value={folderWritable ? 'write' : 'read'}
                      onChange={next => setFolderWritable(next === 'write')}
                    />
                  </Field>
                  {accessFields}
                </>
              )}

              <button
                type="button"
                className="ps-ns-more"
                aria-expanded={moreOpen}
                onClick={() => setMoreOpen(v => !v)}
              >
                {moreOpen ? 'Fewer options' : 'More options'}
              </button>

              {moreOpen && (
                <div className="ps-ns-more-body">
                  {expiryField}
                  {kind === 'folder' && (
                    <>
                      <Field
                        label="Download limit"
                        htmlFor="new-share-downloads"
                        help="Each file or zip download counts once. Leave empty for no limit."
                        error={show(downloadError)}
                      >
                        <input
                          id="new-share-downloads"
                          className="ps-input ps-input-mono ps-ns-short"
                          type="number"
                          min={1}
                          max={MAX_DOWNLOADS}
                          value={downloadLimit}
                          onChange={e => setDownloadLimit(e.target.value)}
                          placeholder="No limit"
                          onKeyDown={onEnter}
                        />
                      </Field>
                      <Field
                        label="Hide from visitors"
                        htmlFor="new-share-excludes"
                        help={<>One per line, like <code>*.log</code> or <code>private/</code>.</>}
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
                </div>
              )}
            </div>

            <div className="ps-ns-footer">
              <button type="button" className="ps-btn ps-btn-ghost" onClick={() => setKind(null)} style={{ marginRight: 'auto' }}>Back</button>
              <button
                type="button"
                className="ps-btn ps-btn-primary"
                onClick={() => void handleSubmit()}
                disabled={submitting || (needsAddress && addresses.length === 0)}
              >
                {submitting ? 'Starting…' : 'Start sharing'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
