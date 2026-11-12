import { useState, type FormEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import type { PathRoute, PersistentTunnel, PreviewNote, Project, ShareAccess } from '../../lib/api'
import { STATUS_BADGES, TYPE_LABELS, extraRoutes, isGatedType, shareAccess, shareAddress, shareLabel, shareStatus, shareUrl } from '../../lib/shares'
import RouteRulesEditor from '../dashboard/RouteRulesEditor'
import { PreviewSetting } from '../dashboard/ShareExtras'
import MobileShareControls from '../dashboard/MobileShareControls'
import { AccessLinks, ExpiryEditor, GuestSessions } from './ShareLifetime'
import { usePreviewNotes } from '../../hooks/usePreviewNotes'
import { useCopy } from '../../hooks/useCopy'
import { useDialog } from '../../hooks/useDialog'

/** Everything a share row and its settings panel need from the app. */
export type ShareControls = {
  portInput: string
  setPortInput: (v: string) => void
  onPortSubmit: (e: FormEvent<HTMLFormElement>) => void
  /** The selected share's routes other than /. */
  routeRules: PathRoute[]
  onRouteRulesChange: (rules: PathRoute[]) => void
  routePortStatus: Record<number, boolean | null>
  persistentTunnels: PersistentTunnel[]
  selectedTunnelId: string | null
  onSelectTunnel: (tunnel: PersistentTunnel) => void
  onStartTunnel: (tunnel: PersistentTunnel) => void
  onStopTunnel: (tunnel: PersistentTunnel) => void
  onDeleteTunnel: (tunnel: PersistentTunnel) => void
  onPauseTunnel: (tunnel: PersistentTunnel, paused: boolean) => void
  portListening: boolean | null
  isBusy: boolean
  onRenameTunnel: (tunnel: PersistentTunnel, name: string) => void
  onAccessChange: (tunnel: PersistentTunnel, access: ShareAccess, password?: string) => Promise<boolean>
  clientId: string
  onTunnelUpdated: (tunnel: PersistentTunnel) => void
  onOpenReview?: (tunnel: PersistentTunnel) => void
  onOpenNote?: (tunnel: PersistentTunnel, note: PreviewNote) => void
}

type Notes = ReturnType<typeof usePreviewNotes>

/** Lets the panel move a share between projects; "" takes it out of every project. */
type ProjectMove = {
  projects: Project[]
  onMoveShare: (tunnel: PersistentTunnel, projectId: string) => void
}

const MIN_PASSWORD = 4

function shareTargets(tunnel: PersistentTunnel): string[] {
  const type = tunnel.tunnelType ?? 'http'
  if (type === 'mobile') return ['Live device']
  if (type === 'tcp' || type === 'udp') return tunnel.publicTcpPort ? [`port ${tunnel.publicTcpPort}`] : []
  const routes = type === 'http' || !tunnel.tunnelType ? extraRoutes(tunnel) : []
  if (routes.length === 0) return [`localhost:${tunnel.port}`]
  return [...routes.map(route => `${route.path} → :${route.port}`), `/ → :${tunnel.port}`]
}

function AccessEditor({ tunnel, isBusy, onSave }: {
  tunnel: PersistentTunnel
  isBusy: boolean
  onSave: (access: ShareAccess, password?: string) => Promise<boolean>
}) {
  const current = shareAccess(tunnel)
  const hasPassword = Boolean(tunnel.password)
  const [access, setAccess] = useState<ShareAccess>(current)
  const [password, setPassword] = useState('')
  const { copied, copy } = useCopy()

  const tooShort = password !== '' && [...password].length < MIN_PASSWORD
  const changed = access !== current || password.trim() !== ''
  const canSave = !isBusy && !tooShort && changed && (access === 'public' || password.trim() !== '' || hasPassword)

  const save = async () => {
    if (!canSave) return
    if (await onSave(access, access === 'private' && password ? password : undefined)) setPassword('')
  }

  return (
    <form className="ps-panel-access" onSubmit={event => { event.preventDefault(); void save() }}>
      <div className="ps-segmented ps-panel-segmented" role="radiogroup" aria-label="Who can open it">
        {(['private', 'public'] as const).map(option => (
          <button
            key={option}
            type="button"
            role="radio"
            aria-checked={access === option}
            className={`ps-segmented-item ${access === option ? 'active' : ''}`}
            onClick={() => setAccess(option)}
          >
            {option === 'private' ? 'With a password' : 'Anyone with the link'}
          </button>
        ))}
      </div>
      {access === 'private' && (
        <div className="ps-panel-password">
          <input
            className="ps-input"
            type="password"
            autoComplete="new-password"
            placeholder={hasPassword ? 'New password' : 'Password'}
            aria-label="Share password"
            value={password}
            onChange={event => setPassword(event.target.value)}
            aria-invalid={tooShort}
          />
          {hasPassword && (
            <button type="button" className="ps-btn ps-btn-ghost ps-btn-sm" onClick={() => void copy('password', tunnel.password ?? '')}>
              {copied === 'password' ? 'Copied' : 'Copy password'}
            </button>
          )}
        </div>
      )}
      {tooShort && <span className="ps-panel-hint ps-share-access-error">Use at least {MIN_PASSWORD} characters.</span>}
      {changed && (
        <div className="ps-panel-save">
          <button type="submit" className="ps-btn ps-btn-primary ps-btn-sm" disabled={!canSave}>Save</button>
          <button type="button" className="ps-btn ps-btn-ghost ps-btn-sm" onClick={() => { setAccess(current); setPassword('') }}>Cancel</button>
        </div>
      )}
    </form>
  )
}

function NameEditor({ tunnel, name, onRename }: { tunnel: PersistentTunnel; name?: string; onRename: (name: string) => void }) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(name ?? '')

  if (editing) {
    const finish = () => {
      setEditing(false)
      if (value.trim() !== (name ?? '').trim()) onRename(value)
    }
    return (
      <input
        autoFocus
        className="ps-input ps-panel-rename"
        value={value}
        maxLength={60}
        placeholder={shareAddress(tunnel)}
        aria-label="Share name"
        onChange={event => setValue(event.target.value)}
        onBlur={finish}
        onKeyDown={event => {
          if (event.key === 'Enter') finish()
          if (event.key === 'Escape') { event.stopPropagation(); setEditing(false); setValue(name ?? '') }
        }}
      />
    )
  }

  return (
    <div className="ps-panel-title-row">
      <h2 className="ps-panel-title">{name || shareAddress(tunnel)}</h2>
      <button type="button" className="ps-rename-btn" onClick={() => { setValue(name ?? ''); setEditing(true) }}>
        {name ? 'Rename' : 'Add a name'}
      </button>
    </div>
  )
}

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="ps-panel-block">
      <h3 className="ps-panel-kicker">{title}</h3>
      {children}
    </section>
  )
}

function SharePanel(props: ShareControls & Partial<ProjectMove> & { tunnel: PersistentTunnel; onClose: () => void; feedback: Notes }) {
  const {
    tunnel, onClose, isBusy, clientId, onRenameTunnel, persistentTunnels, projects, onMoveShare,
    portInput, setPortInput, onPortSubmit, portListening, routeRules, onRouteRulesChange, routePortStatus,
    onStartTunnel, onStopTunnel, onPauseTunnel, onDeleteTunnel, onAccessChange, onTunnelUpdated, onOpenReview, feedback,
  } = props
  const sharingAddress = tunnel.subdomain
    ? persistentTunnels.filter(other => other.id !== tunnel.id && other.subdomain === tunnel.subdomain)
    : []
  const shareNotes = feedback.notes.filter(note => note.tunnelId === tunnel.id)
  const openNotes = shareNotes.filter(note => note.status !== 'resolved').length
  const [moreOpen, setMoreOpen] = useState(false)
  const [moreSection, setMoreSection] = useState<'routes' | 'notes' | 'project' | 'stop' | 'guests' | 'cli' | null>(null)
  const { copied, copy } = useCopy()

  const toggleMoreSection = (id: typeof moreSection) => {
    setMoreSection(current => current === id ? null : id)
  }
  const type = tunnel.tunnelType ?? 'http'
  const isWeb = type === 'http'
  const isMobile = type === 'mobile'
  const status = shareStatus(tunnel)
  const badge = STATUS_BADGES[status]
  const access = shareAccess(tunnel)
  const name = tunnel.name?.trim()
  const url = shareUrl(tunnel)
  const project = projects?.find(item => item.tunnelIds.includes(tunnel.id))

  const panelRef = useDialog(onClose)

  const canOpen = type !== 'tcp' && type !== 'udp'
  const portLine = portListening === null ? 'Checking' : portListening ? 'Running' : 'Not running'

  // Page content animates with a transform, which would pin a fixed panel inside it.
  return createPortal(
    <>
      <div className="ps-panel-backdrop" onClick={onClose} />
      <div
        ref={panelRef}
        className="ps-panel animate-slide-panel"
        role="dialog"
        aria-modal="true"
        aria-label={`Share ${name || shareAddress(tunnel)}`}
        tabIndex={-1}
      >
        <header className="ps-panel-header">
          <div className="ps-panel-top">
            <div className="ps-panel-heading">
              <NameEditor key={`${tunnel.id}-${name ?? ''}`} tunnel={tunnel} name={name} onRename={value => onRenameTunnel(tunnel, value)} />
              <div className="ps-panel-meta">
                <span className={`ps-badge ${badge.className}`}>{badge.label}</span>
                <span>{TYPE_LABELS[type]}</span>
                {project && <span>{project.name}</span>}
              </div>
            </div>
            <button type="button" className="ps-btn ps-btn-ghost ps-btn-sm" onClick={onClose}>Close</button>
          </div>
          <div className="ps-panel-link">
            <span className="ps-panel-url" title={url}>{url}</span>
          </div>
          <div className="ps-panel-actions">
            <button type="button" className="ps-btn ps-btn-secondary ps-btn-sm" onClick={() => void copy('url', url)}>
              {copied === 'url' ? 'Copied' : 'Copy'}
            </button>
            {canOpen && (
              <a className="ps-btn ps-btn-ghost ps-btn-sm" href={url} target="_blank" rel="noreferrer">Open</a>
            )}
            {tunnel.paused && status !== 'expired' ? (
              <button type="button" className="ps-btn ps-btn-primary ps-btn-sm" onClick={() => onPauseTunnel(tunnel, false)} disabled={isBusy}>Resume</button>
            ) : tunnel.active ? (
              <button type="button" className="ps-btn ps-btn-secondary ps-btn-sm" onClick={() => onStopTunnel(tunnel)} disabled={isBusy}>Stop</button>
            ) : (
              <button type="button" className="ps-btn ps-btn-primary ps-btn-sm" onClick={() => onStartTunnel(tunnel)} disabled={isBusy || status === 'expired'}>Start</button>
            )}
            {openNotes > 0 && onOpenReview && (
              <button type="button" className="ps-btn ps-btn-ghost ps-btn-sm" onClick={() => { onClose(); onOpenReview(tunnel) }}>
                Feedback · {openNotes}
              </button>
            )}
          </div>
          {status === 'expired' && <p className="ps-panel-hint">Expired. Set more time under More.</p>}
          {sharingAddress.length > 0 && (
            <p className="ps-panel-hint">Pauses {sharingAddress.map(shareLabel).join(', ')}.</p>
          )}
        </header>

        <div className="ps-panel-body">
          <Block title="Access">
            {isGatedType(type) ? (
              <AccessEditor key={`${tunnel.id}-${access}-${tunnel.password ?? ''}`} tunnel={tunnel} isBusy={isBusy} onSave={(next, password) => onAccessChange(tunnel, next, password)} />
            ) : (
              <p className="ps-panel-hint">{type === 'e2e' ? 'Link only. Encrypted to this computer.' : 'No password. Use the service login.'}</p>
            )}
          </Block>

          <Block title={isMobile ? 'Device' : 'Port'}>
            {isMobile ? (
              <MobileShareControls tunnel={tunnel} isBusy={isBusy} />
            ) : (
              <form onSubmit={onPortSubmit} className="ps-panel-port">
                <div className="ps-input-group">
                  <span className="ps-input-prefix">localhost:</span>
                  <input
                    className="ps-input ps-input-mono"
                    value={portInput}
                    onChange={event => setPortInput(event.target.value)}
                    placeholder="3000"
                    type="number"
                    min={1}
                    max={65535}
                    aria-label="Local port"
                  />
                </div>
                {portInput !== String(tunnel.port) && (
                  <button type="submit" className="ps-btn ps-btn-secondary ps-btn-sm" disabled={isBusy}>Apply</button>
                )}
                <span className={`ps-port-status ${portListening ? 'listening' : portListening === false ? 'offline' : ''}`}>{portLine}</span>
              </form>
            )}
          </Block>

          <section className="ps-panel-block ps-panel-block-more">
            <button
              type="button"
              className="ps-panel-more"
              aria-expanded={moreOpen}
              onClick={() => setMoreOpen(open => {
                if (open) setMoreSection(null)
                else if (!moreSection) setMoreSection(isWeb ? 'routes' : 'stop')
                return !open
              })}
            >
              {moreOpen ? 'Hide' : 'More'}
            </button>
            {moreOpen && (
              <div className="ps-panel-more-body">
                {isWeb && (
                  <div className={`ps-panel-accordion${moreSection === 'routes' ? ' is-open' : ''}`}>
                    <button type="button" className="ps-panel-accordion-head" aria-expanded={moreSection === 'routes'} onClick={() => toggleMoreSection('routes')}>
                      Routes
                    </button>
                    {moreSection === 'routes' && (
                      <div className="ps-panel-accordion-body">
                        <RouteRulesEditor compact rules={routeRules} onChange={onRouteRulesChange} fallbackPort={tunnel.port} portStatus={routePortStatus} />
                      </div>
                    )}
                  </div>
                )}
                {isWeb && (
                  <div className={`ps-panel-accordion${moreSection === 'notes' ? ' is-open' : ''}`}>
                    <button type="button" className="ps-panel-accordion-head" aria-expanded={moreSection === 'notes'} onClick={() => toggleMoreSection('notes')}>
                      Notes
                    </button>
                    {moreSection === 'notes' && (
                      <div className="ps-panel-accordion-body">
                        <PreviewSetting clientId={clientId} tunnel={tunnel} onUpdated={onTunnelUpdated} />
                      </div>
                    )}
                  </div>
                )}
                {projects && onMoveShare && (
                  <div className={`ps-panel-accordion${moreSection === 'project' ? ' is-open' : ''}`}>
                    <button type="button" className="ps-panel-accordion-head" aria-expanded={moreSection === 'project'} onClick={() => toggleMoreSection('project')}>
                      Project
                    </button>
                    {moreSection === 'project' && (
                      <div className="ps-panel-accordion-body">
                        <select
                          className="ps-select ps-panel-project"
                          value={project?.id ?? ''}
                          aria-label="Project"
                          disabled={isBusy}
                          onChange={event => onMoveShare(tunnel, event.target.value)}
                        >
                          <option value="">None</option>
                          {projects.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
                        </select>
                      </div>
                    )}
                  </div>
                )}
                <div className={`ps-panel-accordion${moreSection === 'stop' ? ' is-open' : ''}`}>
                  <button type="button" className="ps-panel-accordion-head" aria-expanded={moreSection === 'stop'} onClick={() => toggleMoreSection('stop')}>
                    Stop
                  </button>
                  {moreSection === 'stop' && (
                    <div className="ps-panel-accordion-body">
                      <ExpiryEditor key={`${tunnel.id}-${tunnel.expiresAt ?? ''}`} clientId={clientId} tunnel={tunnel} onUpdated={onTunnelUpdated} />
                    </div>
                  )}
                </div>
                {isGatedType(type) && access === 'private' && (
                  <div className={`ps-panel-accordion${moreSection === 'guests' ? ' is-open' : ''}`}>
                    <button type="button" className="ps-panel-accordion-head" aria-expanded={moreSection === 'guests'} onClick={() => toggleMoreSection('guests')}>
                      Guests
                    </button>
                    {moreSection === 'guests' && (
                      <div className="ps-panel-accordion-body">
                        {tunnel.password && <AccessLinks clientId={clientId} tunnel={tunnel} />}
                        <GuestSessions clientId={clientId} tunnel={tunnel} />
                      </div>
                    )}
                  </div>
                )}
                {type === 'e2e' && (
                  <div className={`ps-panel-accordion${moreSection === 'cli' ? ' is-open' : ''}`}>
                    <button type="button" className="ps-panel-accordion-head" aria-expanded={moreSection === 'cli'} onClick={() => toggleMoreSection('cli')}>
                      CLI
                    </button>
                    {moreSection === 'cli' && (
                      <div className="ps-panel-accordion-body">
                        <div className="ps-code">kexoz e2e {portInput || tunnel.port} --subdomain {tunnel.subdomain}</div>
                      </div>
                    )}
                  </div>
                )}
                <div className="ps-panel-delete">
                  <span>Delete share</span>
                  <button type="button" className="ps-btn ps-btn-danger ps-btn-sm" onClick={() => onDeleteTunnel(tunnel)} disabled={isBusy}>Delete</button>
                </div>
              </div>
            )}
          </section>
        </div>
      </div>
    </>,
    document.body,
  )
}

type RowProps = {
  tunnel: PersistentTunnel
  open: boolean
  openNotes: number
  copied: boolean
  isBusy: boolean
  onOpen: () => void
  onCopy: () => void
  onStart: () => void
  onStop: () => void
  onResume: () => void
}

function ShareRow({ tunnel, open, openNotes, copied, isBusy, onOpen, onCopy, onStart, onStop, onResume }: RowProps) {
  const status = shareStatus(tunnel)
  const type = tunnel.tunnelType ?? 'http'
  const name = tunnel.name?.trim()
  const address = shareAddress(tunnel)
  const label = name || address
  const accessLabel = isGatedType(type) ? (shareAccess(tunnel) === 'private' ? 'Password' : 'Public') : null
  const target = shareTargets(tunnel)[0]
  return (
    <li className={`ps-share-row ${status} ${open ? 'open' : ''} ${type === 'mobile' ? 'is-mobile' : ''}`}>
      <button type="button" className="ps-share-row-main" onClick={onOpen} aria-label={`Open settings for ${label}`}>
        <span className={`ps-share-dot ${status}`} aria-hidden="true" />
        <span className="ps-share-row-text">
          <span className="ps-share-row-name">
            <span className="ps-share-row-label">{label}</span>
            <span className={`ps-share-row-status ${status}`}>{STATUS_BADGES[status].label}</span>
            {openNotes > 0 && <span className="ps-share-row-notes">{openNotes} open</span>}
          </span>
          <span className="ps-share-row-meta">
            <span>{TYPE_LABELS[type]}</span>
            {target ? <span>{target}</span> : null}
            {accessLabel ? <span>{accessLabel}</span> : null}
            {name ? <span className="ps-share-row-host">{address}</span> : null}
          </span>
        </span>
      </button>
      <div className="ps-share-row-actions">
        {tunnel.paused && status !== 'expired' ? (
          <button type="button" className="ps-btn ps-btn-secondary ps-btn-sm ps-share-run" onClick={onResume} disabled={isBusy}>Resume</button>
        ) : tunnel.active ? (
          <button type="button" className="ps-btn ps-btn-secondary ps-btn-sm ps-share-run" onClick={onStop} disabled={isBusy}>Stop</button>
        ) : (
          <button type="button" className="ps-btn ps-btn-primary ps-btn-sm ps-share-run" onClick={onStart} disabled={isBusy || status === 'expired'}>Start</button>
        )}
        <details className="ps-header-more ps-share-row-more">
          <summary className="ps-btn ps-btn-ghost ps-btn-sm" aria-label={`More for ${label}`}>⋯</summary>
          <div className="ps-header-more-menu" role="menu">
            <button type="button" role="menuitem" onClick={onCopy}>{copied ? 'Copied' : 'Copy'}</button>
            <button type="button" role="menuitem" onClick={onOpen}>Open</button>
          </div>
        </details>
      </div>
    </li>
  )
}

/** Share cards that open their settings in a side panel. */
export default function ShareList(props: ShareControls & Partial<ProjectMove> & { tunnels: PersistentTunnel[] }) {
  const { tunnels, persistentTunnels, selectedTunnelId, onSelectTunnel, onStartTunnel, onStopTunnel, onPauseTunnel, isBusy, clientId } = props
  const feedback = usePreviewNotes(clientId)
  const [openId, setOpenId] = useState<string | null>(null)
  const { copied, copy } = useCopy()
  const openTunnel = openId ? persistentTunnels.find(tunnel => tunnel.id === openId) : undefined

  const open = (tunnel: PersistentTunnel) => {
    if (tunnel.id !== selectedTunnelId) onSelectTunnel(tunnel)
    setOpenId(tunnel.id)
  }

  return (
    <>
      <ul className="ps-share-list">
        {tunnels.map(tunnel => (
          <ShareRow
            key={tunnel.id}
            tunnel={tunnel}
            open={openId === tunnel.id}
            openNotes={feedback.notes.filter(note => note.tunnelId === tunnel.id && note.status !== 'resolved').length}
            copied={copied === tunnel.id}
            isBusy={isBusy}
            onOpen={() => open(tunnel)}
            onCopy={() => void copy(tunnel.id, shareUrl(tunnel))}
            onStart={() => onStartTunnel(tunnel)}
            onStop={() => onStopTunnel(tunnel)}
            onResume={() => onPauseTunnel(tunnel, false)}
          />
        ))}
      </ul>
      {openTunnel && <SharePanel key={openTunnel.id} {...props} tunnel={openTunnel} feedback={feedback} onClose={() => setOpenId(null)} />}
    </>
  )
}
