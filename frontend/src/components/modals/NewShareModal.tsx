import { useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react'
import { QUICK_PORTS } from '../../lib/storage'
import { ROOT_DOMAIN, type PathRoute, type Project, type ShareAccess, type TunnelType } from '../../lib/api'
import { EXPIRY_OPTIONS, environmentLabel, projectNameError, routeError, type NewShareRequest } from '../../lib/shares'
import { usePortScanner } from '../../hooks/usePortScanner'
import RouteRulesEditor from '../dashboard/RouteRulesEditor'

const MIN_PASSWORD = 4
const NEW_PROJECT = '__new'

export type AddressOption = {
  name: string
  /** Labels of the shares already on this address. */
  usedBy: string[]
}

type Props = {
  onClose: () => void
  addresses: AddressOption[]
  projects: Project[]
  /** The project picked when the window opens. */
  projectId?: string
  /** Show path routing straight away, for one link that serves the whole app. */
  routed?: boolean
  /** Environments each project already has ("" is main). */
  environments?: Record<string, string[]>
  /** The environment picked when the window opens. */
  environment?: string
  onManageAddresses: () => void
  onSubmit: (request: NewShareRequest) => void | Promise<void>
}

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

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="ps-ns-section">
      <h3 className="ps-ns-section-title">{title}</h3>
      {children}
    </section>
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

export default function NewShareModal({ onClose, onSubmit, addresses, projects, projectId, routed = false, environments = {}, environment = '', onManageAddresses }: Props) {
  const initialProject = projects.find(project => project.id === projectId)?.id ?? projects[0]?.id ?? NEW_PROJECT
  const [project, setProject] = useState(initialProject)
  const [envChoice, setEnvChoice] = useState(environment)
  const [projectName, setProjectName] = useState('')
  const [address, setAddress] = useState((addresses.find(option => option.usedBy.length === 0) ?? addresses[0])?.name ?? '')
  const [name, setName] = useState('')
  const [port, setPort] = useState('')
  const [protocol, setProtocol] = useState<Protocol>('web')
  const [endToEnd, setEndToEnd] = useState(false)
  const [routing, setRouting] = useState(routed)
  const [routes, setRoutes] = useState<PathRoute[]>(routed ? [{ path: '/api', port: 8080 }] : [])
  const [access, setAccess] = useState<ShareAccess>('private')
  const [preview, setPreview] = useState(false)
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [expiry, setExpiry] = useState<ExpiryId>('never')
  const [customAmount, setCustomAmount] = useState('30')
  const [customUnit, setCustomUnit] = useState<ExpiryUnit>('m')
  const [moreOpen, setMoreOpen] = useState(false)
  const [attempted, setAttempted] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const modalRef = useRef<HTMLDivElement>(null)
  const detectedPorts = usePortScanner(true)

  const tunnelType: TunnelType =
    protocol === 'udp' ? 'udp' :
    protocol === 'tcp' ? (endToEnd ? 'e2e' : 'tcp') :
    'http'

  const isWeb = tunnelType === 'http'
  const needsAddress = tunnelType !== 'tcp' && tunnelType !== 'udp'
  const effectiveAccess: ShareAccess = isWeb ? access : 'public'
  const needsPassword = isWeb && effectiveAccess === 'private'
  const creatingProject = project === NEW_PROJECT
  const projectEnvironments = creatingProject ? [] : environments[project] ?? []
  const chosenEnvironment = projectEnvironments.includes(envChoice) ? envChoice : ''
  const usedRoutes = isWeb && routing ? routes : []

  const portNumber = Number(port)
  const trimmedProjectName = projectName.trim().replace(/\s+/g, ' ')
  const projectError = !creatingProject ? ''
    : projectNameError(projectName)
      || (projects.some(item => item.name.toLowerCase() === trimmedProjectName.toLowerCase()) ? 'You already have a project with that name.' : '')
  const addressError = !needsAddress || address ? '' : 'Choose an address for the link.'
  const portError = port.trim() === ''
    ? 'Enter the port your app is running on.'
    : !Number.isInteger(portNumber) || portNumber < 1 || portNumber > 65535
      ? 'Use a port between 1 and 65535.'
      : ''
  const routesError = usedRoutes.some((route, index) => routeError(route, usedRoutes.filter((_, other) => other !== index)))
    ? 'Fix the paths above, or remove the ones you don’t need.'
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
  const duration = expiry === 'custom'
    ? `${customMinutes}m`
    : EXPIRY_OPTIONS.find(option => option.id === expiry)?.duration || undefined
  const visibleError = projectError || portError || routesError || addressError || passwordError
  const firstError = visibleError || expiryError
  const sharedWith = addresses.find(option => option.name === address)?.usedBy ?? []
  const detectedLabel = detectedPorts.find(detected => detected.port === portNumber)?.label
  const portStatus = Object.fromEntries(
    [...usedRoutes.map(route => route.port), portNumber].filter(value => Number.isInteger(value) && value > 0)
      .map(value => [value, detectedPorts.some(detected => detected.port === value)]),
  ) as Record<number, boolean>
  const show = (error: string) => (attempted ? error : '')

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.stopPropagation()
      onClose()
      return
    }
    if (event.key !== 'Tab' || !modalRef.current) return
    const focusable = modalRef.current.querySelectorAll<HTMLElement>(
      'button:not([disabled]), input:not([disabled]):not([readonly]), select, textarea, [href], [tabindex]:not([tabindex="-1"])'
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

  const toggleRouting = (next: boolean) => {
    setRouting(next)
    if (next && routes.length === 0) setRoutes([{ path: '/api', port: 8080 }])
  }

  const handleSubmit = async () => {
    setAttempted(true)
    if (firstError) {
      if (expiryError && !visibleError) setMoreOpen(true)
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
        port: portNumber,
        access: effectiveAccess,
        permissions: 'read-write',
        password: needsPassword ? password : undefined,
        duration,
        preview: isWeb && preview,
        extraRoutes: usedRoutes.map(route => ({ path: route.path.trim().replace(/\/+$/, ''), port: route.port })),
        name: name.trim() || undefined,
        projectId: creatingProject ? undefined : project,
        newProjectName: creatingProject ? trimmedProjectName : undefined,
        environment: chosenEnvironment || undefined,
      })
    } finally {
      setSubmitting(false)
    }
  }

  const onEnter = (e: ReactKeyboardEvent<HTMLInputElement>) => { if (e.key === 'Enter') void handleSubmit() }

  const projectField = (
    <Field
      label="Project"
      htmlFor="new-share-project"
      error={show(projectError)}
      help={creatingProject ? 'Shares in a project start and stop together.' : undefined}
    >
      <div className="ps-ns-project">
        {projects.length > 0 && (
          <div className="ps-input-group">
            <select
              id="new-share-project"
              className="ps-ns-select"
              value={project}
              onChange={e => setProject(e.target.value)}
            >
              {projects.map(item => (
                <option key={item.id} value={item.id}>{item.name}</option>
              ))}
              <option value={NEW_PROJECT}>New project…</option>
            </select>
          </div>
        )}
        {projectEnvironments.length > 1 && (
          <div className="ps-input-group">
            <select
              className="ps-ns-select"
              value={chosenEnvironment}
              onChange={e => setEnvChoice(e.target.value)}
              aria-label="Environment"
            >
              {projectEnvironments.map(item => (
                <option key={item || 'main'} value={item}>{environmentLabel(item)}</option>
              ))}
            </select>
          </div>
        )}
        {creatingProject && (
          <input
            id={projects.length > 0 ? 'new-share-project-name' : 'new-share-project'}
            className="ps-input"
            value={projectName}
            maxLength={40}
            onChange={e => setProjectName(e.target.value)}
            onKeyDown={onEnter}
            placeholder="Like my-app"
            aria-label="New project name"
            aria-invalid={attempted && Boolean(projectError)}
            autoFocus={projects.length > 0}
          />
        )}
      </div>
    </Field>
  )

  const portField = (
    <Field
      label={routing && isWeb ? 'Frontend port' : 'Port'}
      htmlFor="new-share-port"
      error={show(portError)}
      help={routing && isWeb ? 'Every path you don’t route below goes here.' : undefined}
    >
      <div className="ps-input-group ps-ns-port-input">
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
          autoFocus={!creatingProject || projects.length === 0}
          onKeyDown={onEnter}
          aria-invalid={attempted && Boolean(portError)}
        />
      </div>
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
    </Field>
  )

  const routingFields = isWeb && (
    <div className="ps-ns-field">
      <div className="ps-ns-toggles">
        <ToggleRow
          title="Frontend and backend on one link"
          desc="Send paths like /api to another port. Everything else goes to the port above."
          checked={routing}
          onChange={toggleRouting}
        />
      </div>
      {routing && (
        <>
          <RouteRulesEditor rules={routes} onChange={setRoutes} fallbackPort={Number.isInteger(portNumber) && portNumber > 0 ? portNumber : null} portStatus={portStatus} />
          {show(routesError) && <p className="ps-ns-error" role="alert">{routesError}</p>}
        </>
      )}
    </div>
  )

  const accessFields = isWeb && (
    <div className="ps-ns-field">
      <Segmented
        label="Who can open it"
        options={[{ id: 'private', label: 'Password' }, { id: 'public', label: 'Anyone with the link' }]}
        value={access}
        onChange={setAccess}
      />
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
      {needsPassword && show(passwordError)
        ? <p className="ps-ns-error" role="alert">{passwordError}</p>
        : <p className="field-help">{needsPassword ? 'Visitors type it once, then the share opens.' : 'Anyone who has the link can open it.'}</p>}
    </div>
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
      label="Address"
      htmlFor="new-share-address"
      aside={<button type="button" className="ps-ns-link" onClick={onManageAddresses}>Manage addresses</button>}
      error={addresses.length > 0 ? show(addressError) : undefined}
      help={sharedWith.length > 0
        ? `${sharedWith.join(', ')} ${sharedWith.length === 1 ? 'uses' : 'use'} this address too. Only one runs at a time, so starting this pauses the other.`
        : undefined}
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
            {addresses.map(option => (
              <option key={option.name} value={option.name}>
                {option.name}.{ROOT_DOMAIN}{option.usedBy.length > 0 ? ' (in use)' : ''}
              </option>
            ))}
          </select>
        </div>
      ) : (
        <div className="ps-ns-notice">
          <span>You don’t have an address yet. Add one on the Domains page.</span>
          <button type="button" className="ps-btn ps-btn-secondary ps-btn-sm" onClick={onManageAddresses}>Domains</button>
        </div>
      )}
    </Field>
  )

  const nameField = (
    <Field label="Name" htmlFor="new-share-name" aside={<span className="ps-ns-optional">Optional</span>}>
      <input
        id="new-share-name"
        className="ps-input"
        value={name}
        maxLength={60}
        onChange={e => setName(e.target.value)}
        onKeyDown={onEnter}
        placeholder={routing && isWeb ? 'Like Web app' : detectedLabel ? `Like ${detectedLabel}` : 'Like Frontend'}
      />
    </Field>
  )

  const projectLabel = creatingProject ? trimmedProjectName : projects.find(item => item.id === project)?.name
  const previewLink = needsAddress ? (address ? `${address}.${ROOT_DOMAIN}` : 'Pick an address') : `A public ${protocol === 'udp' ? 'UDP' : 'TCP'} port`
  const previewTarget = Number.isInteger(portNumber) && portNumber > 0 ? `localhost:${portNumber}` : 'localhost:port'

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
            <p className="ps-ns-context">
              {projectLabel ? <>Adds to <strong>{projectLabel}</strong></> : 'Put something on this computer online with a link.'}
            </p>
          </div>
        </div>

        <div className="ps-ns-body">
          <Section title="Your app">
            <Segmented
              label="Kind of traffic"
              options={PROTOCOLS}
              value={protocol}
              onChange={next => { setProtocol(next); setEndToEnd(false) }}
            />
            {portField}
            {protocol !== 'web' && (
              <p className="field-help ps-ns-note">You get a public address and port. Anyone who has it can connect, so keep your service’s own login on.</p>
            )}
            {protocol === 'tcp' && (
              <div className="ps-ns-toggles">
                <ToggleRow
                  title="End-to-end encryption"
                  desc="For services that speak TLS. You get a link instead of a port, and traffic reaches your service untouched."
                  checked={endToEnd}
                  onChange={setEndToEnd}
                />
              </div>
            )}
            {routingFields}
          </Section>

          <Section title={needsAddress ? 'Link' : 'Details'}>
            {needsAddress && addressField}
            <div className="ps-ns-grid">
              {nameField}
              {projectField}
            </div>
          </Section>

          {isWeb && (
            <Section title="Who can open it">
              {accessFields}
              <div className="ps-ns-toggles">
                <ToggleRow
                  title="Visual review"
                  desc="Visitors pin notes anywhere on the page. You resolve them here or on the page."
                  checked={preview}
                  onChange={setPreview}
                />
              </div>
            </Section>
          )}

          <div className="ps-ns-more-wrap">
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
              </div>
            )}
          </div>
        </div>

        <div className="ps-ns-footer">
          <div className="ps-ns-summary" aria-live="polite">
            <span className="ps-ns-summary-link">{previewLink}</span>
            <span className="ps-ns-summary-arrow" aria-hidden="true">→</span>
            <span className="ps-ns-summary-target">{previewTarget}</span>
          </div>
          <button type="button" className="ps-btn ps-btn-ghost" onClick={onClose}>Cancel</button>
          <button
            type="button"
            className="ps-btn ps-btn-primary"
            onClick={() => void handleSubmit()}
            disabled={submitting || (needsAddress && addresses.length === 0)}
          >
            {submitting ? 'Starting…' : creatingProject ? 'Create project and start' : 'Start sharing'}
          </button>
        </div>
      </div>
    </div>
  )
}
