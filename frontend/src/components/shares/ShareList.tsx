import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import type { PersistentTunnel, ShareAccess } from '../../lib/api'
import { STATUS_BADGES, TYPE_LABELS, isGatedType, shareAccess, shareAddress, shareLabel, shareStatus, shareUrl, type FolderShareConfig } from '../../lib/shares'
import RouteRulesEditor from '../dashboard/RouteRulesEditor'
import { PreviewSetting, ShareFeedback } from '../dashboard/ShareExtras'
import { usePreviewNotes } from '../../hooks/usePreviewNotes'
import { useCopy } from '../../hooks/useCopy'

/** Everything a share row and its settings panel need from the app. */
export type ShareControls = {
  portInput: string
  setPortInput: (v: string) => void
  onPortSubmit: (e: FormEvent<HTMLFormElement>) => void
  routeRules: Array<{ path: string; port: number }>
  onRouteRulesChange: (rules: Array<{ path: string; port: number }>) => void
  routePortStatus: Record<number, boolean | null>
  persistentTunnels: PersistentTunnel[]
  selectedTunnelId: string | null
  onSelectTunnel: (tunnel: PersistentTunnel) => void
  onStartTunnel: (tunnel: PersistentTunnel) => void
  onStopTunnel: (tunnel: PersistentTunnel) => void
  onDeleteTunnel: (tunnel: PersistentTunnel) => void
  onPauseTunnel: (tunnel: PersistentTunnel, paused: boolean) => void
  folderShares: Record<string, FolderShareConfig>
  portListening: boolean | null
  isBusy: boolean
  onRenameTunnel: (tunnel: PersistentTunnel, name: string) => void
  onAccessChange: (tunnel: PersistentTunnel, access: ShareAccess, password?: string) => Promise<boolean>
  clientId: string
  onTunnelUpdated: (tunnel: PersistentTunnel) => void
}

type Notes = ReturnType<typeof usePreviewNotes>

const MIN_PASSWORD = 4

function shareTarget(tunnel: PersistentTunnel, folder?: FolderShareConfig): string {
  if (tunnel.tunnelType === 'folder') return folder?.root ?? 'Folder on another device'
  if (tunnel.tunnelType === 'pty') return 'Terminal on this computer'
  return `localhost:${tunnel.port}`
}

function AccessEditor({ tunnel, isBusy, onSave }: {
  tunnel: PersistentTunnel
  isBusy: boolean
  onSave: (access: ShareAccess, password?: string) => Promise<boolean>
}) {
  const current = shareAccess(tunnel)
  const terminal = tunnel.tunnelType === 'pty'
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
      {!terminal && (
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
      )}
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

function Section({ title, hint, children }: { title: string; hint?: string; children?: ReactNode }) {
  return (
    <section className="ps-panel-section">
      <h3 className="ps-panel-section-title">{title}</h3>
      {hint && <p className="ps-panel-hint">{hint}</p>}
      {children}
    </section>
  )
}

function SharePanel(props: ShareControls & { tunnel: PersistentTunnel; onClose: () => void; feedback: Notes }) {
  const {
    tunnel, onClose, isBusy, clientId, folderShares, onRenameTunnel, persistentTunnels,
    portInput, setPortInput, onPortSubmit, portListening, routeRules, onRouteRulesChange, routePortStatus,
    onStartTunnel, onStopTunnel, onPauseTunnel, onDeleteTunnel, onAccessChange, onTunnelUpdated, feedback,
  } = props
  const sharingAddress = tunnel.subdomain
    ? persistentTunnels.filter(other => other.id !== tunnel.id && other.subdomain === tunnel.subdomain)
    : []
  const shareNotes = feedback.notes.filter(note => note.tunnelId === tunnel.id)
  const [showRoutes, setShowRoutes] = useState(tunnel.pathRoutes.some(route => route.path !== '/'))
  const { copied, copy } = useCopy()
  const type = tunnel.tunnelType ?? 'http'
  const status = shareStatus(tunnel)
  const badge = STATUS_BADGES[status]
  const access = shareAccess(tunnel)
  const folder = folderShares[tunnel.id]
  const name = tunnel.name?.trim()
  const url = shareUrl(tunnel)

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const accessHint =
    type === 'pty' ? 'Terminals always ask for the password.' :
    access === 'public' ? 'Anyone who has the link can open it.' :
    'Visitors type the password once, then the share opens.'

  return (
    <>
      <div className="ps-panel-backdrop" onClick={onClose} />
      <aside className="ps-panel" role="dialog" aria-modal="false" aria-label={`Share ${name || shareAddress(tunnel)}`}>
        <header className="ps-panel-header">
          <div className="ps-panel-heading">
            <NameEditor key={`${tunnel.id}-${name ?? ''}`} tunnel={tunnel} name={name} onRename={value => onRenameTunnel(tunnel, value)} />
            <div className="ps-panel-meta">
              <span className={`ps-badge ${badge.className}`}>{badge.label}</span>
              <span>{TYPE_LABELS[type]}</span>
            </div>
          </div>
          <button type="button" className="ps-btn ps-btn-ghost ps-btn-sm" onClick={onClose}>Close</button>
        </header>

        <div className="ps-panel-body">
          <div className="ps-panel-link">
            <span className="ps-panel-url" title={url}>{url}</span>
            <button type="button" className="ps-btn ps-btn-secondary ps-btn-sm" onClick={() => void copy('url', url)}>
              {copied === 'url' ? 'Copied' : 'Copy'}
            </button>
            {(type !== 'tcp' && type !== 'udp') && (
              <a className="ps-btn ps-btn-ghost ps-btn-sm" href={url} target="_blank" rel="noreferrer">Open</a>
            )}
          </div>
          {sharingAddress.length > 0 && (
            <p className="ps-panel-hint">
              {sharingAddress.map(shareLabel).join(', ')} {sharingAddress.length === 1 ? 'uses' : 'use'} this address too.
              Only one share runs on it at a time; starting one pauses whichever is running.
            </p>
          )}

          <div className="ps-panel-run">
            {tunnel.active ? (
              <button className="ps-btn ps-btn-secondary" onClick={() => onStopTunnel(tunnel)} disabled={isBusy}>Stop sharing</button>
            ) : (
              <button className="ps-btn ps-btn-primary" onClick={() => onStartTunnel(tunnel)} disabled={isBusy || status === 'expired'}>Start sharing</button>
            )}
            {tunnel.paused && status !== 'expired' && (
              <button className="ps-btn ps-btn-secondary" onClick={() => onPauseTunnel(tunnel, false)} disabled={isBusy}>Let visitors in again</button>
            )}
            {status === 'expired' && <span className="ps-panel-hint">This share has expired. Create a new one to share again.</span>}
            {tunnel.expiresAt && status !== 'expired' && (
              <span className="ps-panel-hint">Stops on {new Date(tunnel.expiresAt).toLocaleString()}</span>
            )}
          </div>

          {isGatedType(type) ? (
            <Section title="Who can open it" hint={accessHint}>
              <AccessEditor key={`${tunnel.id}-${access}-${tunnel.password ?? ''}`} tunnel={tunnel} isBusy={isBusy} onSave={(next, password) => onAccessChange(tunnel, next, password)} />
            </Section>
          ) : (
            <Section title="Who can open it" hint={type === 'e2e'
              ? 'Anyone with the link. Traffic is encrypted all the way to your computer.'
              : 'Anyone who has the address and port can connect.'} />
          )}

          {type === 'http' && (
            <PreviewSetting clientId={clientId} tunnel={tunnel} onUpdated={onTunnelUpdated} />
          )}

          {(tunnel.preview || shareNotes.length > 0) && (
            <ShareFeedback
              tunnel={tunnel}
              notes={shareNotes}
              busyId={feedback.busyId}
              onStatus={(note, status) => void feedback.setStatus(note, status)}
              onDelete={note => void feedback.remove(note)}
            />
          )}

          {type === 'folder' ? (
            <Section title="Folder">
              <div className="ps-panel-target">{shareTarget(tunnel, folder)}</div>
              <p className="ps-panel-hint">
                {tunnel.permissions === 'read-write' ? 'Visitors can download and upload.' : 'Visitors can only download.'}
              </p>
            </Section>
          ) : type === 'pty' ? (
            <Section title="Terminal" hint={tunnel.permissions === 'read' ? 'Visitors can watch but not type.' : 'Visitors can type in this terminal.'} />
          ) : (
            <Section title="Your app" hint="The port on this computer that visitors reach.">
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
              {portListening !== null && (
                <span className={`ps-port-status ${portListening ? 'listening' : 'offline'}`}>
                  {portListening ? 'Your app is running' : 'Nothing is running on this port yet'}
                </span>
              )}
              {type === 'http' && (
                <>
                  <button type="button" className="ps-panel-disclosure" onClick={() => setShowRoutes(v => !v)} aria-expanded={showRoutes}>
                    {showRoutes ? 'Hide path routing' : 'Send some paths to another port'}
                  </button>
                  {showRoutes && <RouteRulesEditor rules={routeRules} onChange={onRouteRulesChange} portStatus={routePortStatus} />}
                </>
              )}
              {type === 'e2e' && (
                <>
                  <p className="ps-panel-hint">Run this with the Kexoz CLI to start it:</p>
                  <div className="ps-code">kexoz e2e {portInput || tunnel.port} --subdomain {tunnel.subdomain}</div>
                </>
              )}
            </Section>
          )}

          <div className="ps-panel-danger">
            <button className="ps-btn ps-btn-ghost ps-btn-sm ps-btn-text-danger" onClick={() => onDeleteTunnel(tunnel)} disabled={isBusy}>
              Delete share
            </button>
          </div>
        </div>
      </aside>
    </>
  )
}

type RowProps = {
  tunnel: PersistentTunnel
  open: boolean
  openNotes: number
  folder?: FolderShareConfig
  copied: boolean
  isBusy: boolean
  onOpen: () => void
  onCopy: () => void
  onStart: () => void
  onStop: () => void
  onResume: () => void
}

function ShareRow({ tunnel, open, openNotes, folder, copied, isBusy, onOpen, onCopy, onStart, onStop, onResume }: RowProps) {
  const status = shareStatus(tunnel)
  const type = tunnel.tunnelType ?? 'http'
  const name = tunnel.name?.trim()
  const address = shareAddress(tunnel)
  const label = name || address
  const details = [
    name ? address : null,
    TYPE_LABELS[type],
    shareTarget(tunnel, folder),
    isGatedType(type) ? (shareAccess(tunnel) === 'private' ? 'Password' : 'Public') : null,
  ].filter(Boolean).join(' · ')
  return (
    <li className={`ps-share-row ${open ? 'open' : ''}`}>
      <button type="button" className="ps-share-row-main" onClick={onOpen} aria-label={`Open settings for ${label}`}>
        <span className={`ps-share-dot ${status}`} aria-hidden="true" />
        <span className="ps-share-row-text">
          <span className="ps-share-row-name">
            {label}
            <span className={`ps-share-row-status ${status}`}>{STATUS_BADGES[status].label}</span>
            {openNotes > 0 && <span className="ps-share-row-notes">{openNotes} new {openNotes === 1 ? 'note' : 'notes'}</span>}
          </span>
          <span className="ps-share-row-sub">{details}</span>
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

/** Share rows that open their settings in a side panel. */
export default function ShareList(props: ShareControls & { tunnels: PersistentTunnel[] }) {
  const { tunnels, persistentTunnels, selectedTunnelId, onSelectTunnel, onStartTunnel, onStopTunnel, onPauseTunnel, folderShares, isBusy, clientId } = props
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
            openNotes={feedback.notes.filter(note => note.tunnelId === tunnel.id && note.status === 'open').length}
            folder={folderShares[tunnel.id]}
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
      {openTunnel && <SharePanel {...props} tunnel={openTunnel} feedback={feedback} onClose={() => setOpenId(null)} />}
    </>
  )
}
