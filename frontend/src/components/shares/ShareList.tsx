import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import type { PathRoute, PersistentTunnel, Project, ShareAccess } from '../../lib/api'
import { STATUS_BADGES, TYPE_LABELS, extraRoutes, isGatedType, shareAccess, shareAddress, shareLabel, shareStatus, shareUrl } from '../../lib/shares'
import RouteRulesEditor from '../dashboard/RouteRulesEditor'
import { PreviewSetting, ShareFeedback } from '../dashboard/ShareExtras'
import { AccessLinks, ExpiryEditor, GuestSessions } from './ShareLifetime'
import ShareAnalyticsSection from './ShareAnalytics'
import { usePreviewNotes } from '../../hooks/usePreviewNotes'
import { useCopy } from '../../hooks/useCopy'

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
}

type Notes = ReturnType<typeof usePreviewNotes>

/** Lets the panel move a share between projects; "" takes it out of every project. */
type ProjectMove = {
  projects: Project[]
  onMoveShare: (tunnel: PersistentTunnel, projectId: string) => void
}

const MIN_PASSWORD = 4

function shareTargets(tunnel: PersistentTunnel): string[] {
  const routes = tunnel.tunnelType === 'http' || !tunnel.tunnelType ? extraRoutes(tunnel) : []
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
            {option === 'private' ? 'Password' : 'Anyone with the link'}
          </button>
        ))}
      </div>
      {access === 'private' && (
        <div className="ps-panel-password">
          <input
            className="ps-input"
            type="password"
            autoComplete="new-password"
            placeholder={hasPassword ? 'Type a new password to change it' : 'Choose a password'}
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

function Section({ title, hint, aside, children }: { title: string; hint?: string; aside?: ReactNode; children?: ReactNode }) {
  return (
    <section className="ps-panel-section">
      <div className="ps-panel-section-head">
        <div className="ps-panel-section-text">
          <h3 className="ps-panel-section-title">{title}</h3>
          {hint && <p className="ps-panel-hint">{hint}</p>}
        </div>
        {aside}
      </div>
      {children}
    </section>
  )
}

type PanelTab = 'settings' | 'feedback' | 'traffic'

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
  const [showRoutes, setShowRoutes] = useState(extraRoutes(tunnel).length > 0)
  const [tab, setTab] = useState<PanelTab>('settings')
  const { copied, copy } = useCopy()
  const type = tunnel.tunnelType ?? 'http'
  const isWeb = type === 'http'
  const status = shareStatus(tunnel)
  const badge = STATUS_BADGES[status]
  const access = shareAccess(tunnel)
  const name = tunnel.name?.trim()
  const url = shareUrl(tunnel)
  const project = projects?.find(item => item.tunnelIds.includes(tunnel.id))
  const activeTab: PanelTab = isWeb ? tab : 'settings'

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const accessHint =
    access === 'public' ? 'Anyone who has the link can open it.' :
    'Visitors type the password once, then the share opens.'

  const tabs: { id: PanelTab; label: string; count?: number }[] = [
    { id: 'settings', label: 'Settings' },
    { id: 'feedback', label: 'Feedback', count: openNotes },
    { id: 'traffic', label: 'Traffic' },
  ]

  // Page content animates with a transform, which would pin a fixed panel inside it.
  return createPortal(
    <>
      <div className="ps-panel-backdrop" onClick={onClose} />
      <aside className="ps-panel" role="dialog" aria-modal="false" aria-label={`Share ${name || shareAddress(tunnel)}`}>
        <header className="ps-panel-header">
          <div className="ps-panel-heading">
            <NameEditor key={`${tunnel.id}-${name ?? ''}`} tunnel={tunnel} name={name} onRename={value => onRenameTunnel(tunnel, value)} />
            <div className="ps-panel-meta">
              <span className={`ps-badge ${badge.className}`}>{badge.label}</span>
              <span>{TYPE_LABELS[type]}</span>
              {project && <span>in {project.name}</span>}
              {tunnel.environment && <span>{tunnel.environment}</span>}
            </div>
          </div>
          <button type="button" className="ps-btn ps-btn-ghost ps-btn-sm" onClick={onClose}>Close</button>
        </header>

        <div className="ps-panel-hero">
          <div className="ps-panel-link">
            <span className="ps-panel-url" title={url}>{url}</span>
            <button type="button" className="ps-btn ps-btn-secondary ps-btn-sm" onClick={() => void copy('url', url)}>
              {copied === 'url' ? 'Copied' : 'Copy'}
            </button>
            {(type !== 'tcp' && type !== 'udp') && (
              <a className="ps-btn ps-btn-ghost ps-btn-sm" href={url} target="_blank" rel="noreferrer">Open</a>
            )}
          </div>
          <div className="ps-panel-run">
            {tunnel.active ? (
              <button className="ps-btn ps-btn-secondary" onClick={() => onStopTunnel(tunnel)} disabled={isBusy}>Stop sharing</button>
            ) : (
              <button className="ps-btn ps-btn-primary" onClick={() => onStartTunnel(tunnel)} disabled={isBusy || status === 'expired'}>Start sharing</button>
            )}
            {tunnel.paused && status !== 'expired' && (
              <button className="ps-btn ps-btn-secondary" onClick={() => onPauseTunnel(tunnel, false)} disabled={isBusy}>Let visitors in again</button>
            )}
            <ExpiryEditor key={`${tunnel.id}-${tunnel.expiresAt ?? ''}`} clientId={clientId} tunnel={tunnel} onUpdated={onTunnelUpdated} />
          </div>
          {status === 'expired' && <p className="ps-panel-hint">This share has expired. Give it more time to share again.</p>}
          {portListening !== null && (
            <p className={`ps-panel-port-line ${portListening ? 'listening' : 'offline'}`}>
              <span className="ps-share-dot" aria-hidden="true" />
              {portListening ? `Your app is running on localhost:${tunnel.port}` : `Nothing is running on localhost:${tunnel.port} yet`}
            </p>
          )}
          {sharingAddress.length > 0 && (
            <p className="ps-panel-hint">
              {sharingAddress.map(shareLabel).join(', ')} {sharingAddress.length === 1 ? 'uses' : 'use'} this address too.
              Only one share runs on it at a time; starting one pauses whichever is running.
            </p>
          )}
        </div>

        {isWeb && (
          <div className="ps-panel-tabs" role="tablist" aria-label="Share sections">
            {tabs.map(item => (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={activeTab === item.id}
                className={`ps-panel-tab ${activeTab === item.id ? 'active' : ''}`}
                onClick={() => setTab(item.id)}
              >
                {item.label}
                {item.count ? <span className="ps-panel-tab-count">{item.count}</span> : null}
              </button>
            ))}
          </div>
        )}

        <div className="ps-panel-body">
          {activeTab === 'settings' && (
            <>
              {isGatedType(type) ? (
                <Section title="Who can open it" hint={accessHint}>
                  <AccessEditor key={`${tunnel.id}-${access}-${tunnel.password ?? ''}`} tunnel={tunnel} isBusy={isBusy} onSave={(next, password) => onAccessChange(tunnel, next, password)} />
                  {access === 'private' && tunnel.password && <AccessLinks clientId={clientId} tunnel={tunnel} />}
                  {access === 'private' && <GuestSessions clientId={clientId} tunnel={tunnel} />}
                </Section>
              ) : (
                <Section title="Who can open it" hint={type === 'e2e'
                  ? 'Anyone with the link. Traffic is encrypted all the way to your computer.'
                  : 'Anyone who has the address and port can connect.'} />
              )}

              <Section title="Your app" hint={isWeb ? 'The port that serves every path you haven’t routed elsewhere.' : 'The port on this computer that visitors reach.'}>
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
                </form>
                {isWeb && (
                  <>
                    <button type="button" className="ps-panel-disclosure" onClick={() => setShowRoutes(v => !v)} aria-expanded={showRoutes}>
                      {showRoutes ? 'Hide path routing' : 'Send /api or other paths to another port'}
                    </button>
                    {showRoutes && (
                      <RouteRulesEditor rules={routeRules} onChange={onRouteRulesChange} fallbackPort={tunnel.port} portStatus={routePortStatus} />
                    )}
                  </>
                )}
                {type === 'e2e' && (
                  <>
                    <p className="ps-panel-hint">Run this with the Kexoz CLI to start it:</p>
                    <div className="ps-code">kexoz e2e {portInput || tunnel.port} --subdomain {tunnel.subdomain}</div>
                  </>
                )}
              </Section>

              {projects && onMoveShare && (
                <Section title="Project" hint="Shares in a project start and stop together.">
                  <select
                    className="ps-select ps-panel-project"
                    value={project?.id ?? ''}
                    aria-label="Project"
                    disabled={isBusy}
                    onChange={event => onMoveShare(tunnel, event.target.value)}
                  >
                    <option value="">Not in a project</option>
                    {projects.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
                  </select>
                </Section>
              )}

              <section className="ps-panel-danger">
                <div className="ps-panel-section-text">
                  <h3 className="ps-panel-section-title">Delete share</h3>
                  <p className="ps-panel-hint">The link stops working. Your address stays yours.</p>
                </div>
                <button className="ps-btn ps-btn-danger ps-btn-sm" onClick={() => onDeleteTunnel(tunnel)} disabled={isBusy}>Delete</button>
              </section>
            </>
          )}

          {activeTab === 'feedback' && (
            <>
              <PreviewSetting clientId={clientId} tunnel={tunnel} onUpdated={onTunnelUpdated} />
              <ShareFeedback
                tunnel={tunnel}
                notes={shareNotes}
                busyId={feedback.busyId}
                onStatus={(note, next) => void feedback.setStatus(note, next)}
                onDelete={note => void feedback.remove(note)}
                onOpenReview={onOpenReview ? () => { onClose(); onOpenReview(tunnel) } : undefined}
              />
            </>
          )}

          {activeTab === 'traffic' && <ShareAnalyticsSection clientId={clientId} tunnel={tunnel} />}
        </div>
      </aside>
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
  const tags = [
    tunnel.environment || null,
    TYPE_LABELS[type],
    ...shareTargets(tunnel),
    isGatedType(type) ? (shareAccess(tunnel) === 'private' ? 'Password' : 'Public') : null,
  ].filter((tag): tag is string => Boolean(tag))
  return (
    <li className={`ps-share-row ${status} ${open ? 'open' : ''}`}>
      <button type="button" className="ps-share-row-main" onClick={onOpen} aria-label={`Open settings for ${label}`}>
        <span className={`ps-share-dot ${status}`} aria-hidden="true" />
        <span className="ps-share-row-text">
          <span className="ps-share-row-name">
            <span className="ps-share-row-label">{label}</span>
            <span className={`ps-share-row-status ${status}`}>{STATUS_BADGES[status].label}</span>
            {openNotes > 0 && <span className="ps-share-row-notes">{openNotes} open {openNotes === 1 ? 'note' : 'notes'}</span>}
          </span>
          {name && <span className="ps-share-row-address">{address}</span>}
          <span className="ps-share-row-tags">
            {tags.map(tag => <span key={tag} className="ps-share-tag">{tag}</span>)}
          </span>
        </span>
      </button>
      <div className="ps-share-row-actions">
        <button type="button" className="ps-btn ps-btn-ghost ps-btn-sm" onClick={onCopy} aria-label={`Copy link for ${label}`}>
          {copied ? 'Copied' : 'Copy link'}
        </button>
        {tunnel.paused && status !== 'expired' ? (
          <button type="button" className="ps-btn ps-btn-secondary ps-btn-sm ps-share-run" onClick={onResume} disabled={isBusy}>Resume</button>
        ) : tunnel.active ? (
          <button type="button" className="ps-btn ps-btn-secondary ps-btn-sm ps-share-run" onClick={onStop} disabled={isBusy}>Stop</button>
        ) : (
          <button type="button" className="ps-btn ps-btn-primary ps-btn-sm ps-share-run" onClick={onStart} disabled={isBusy || status === 'expired'}>Start</button>
        )}
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
