import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import type { PersistentTunnel, ShareAccess } from '../../lib/api'
import { ROOT_DOMAIN } from '../../lib/api'
import { STATUS_BADGES, TYPE_LABELS, isGatedType, shareAccess, shareStatus, shareUrl, type FolderShareConfig } from '../../lib/shares'
import RouteRulesEditor from '../dashboard/RouteRulesEditor'
import { GuestLinks, PreviewSetting } from '../dashboard/ShareExtras'

type Props = {
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
  onNewTunnel: () => void
  tunnelNames: Record<string, string>
  onRenameTunnel: (id: string, name: string) => void
  onAccessChange: (tunnel: PersistentTunnel, access: ShareAccess, password?: string) => Promise<boolean>
  clientId: string
  onTunnelUpdated: (tunnel: PersistentTunnel) => void
  onViewFeedback: () => void
}

const MIN_PASSWORD = 4

const shareAddress = (tunnel: PersistentTunnel): string =>
  tunnel.subdomain ? `${tunnel.subdomain}.${ROOT_DOMAIN}` : shareUrl(tunnel).replace(/^\w+:\/\//, '')

function shareTarget(tunnel: PersistentTunnel, folder?: FolderShareConfig): string {
  if (tunnel.tunnelType === 'folder') return folder?.root ?? 'Folder on another device'
  if (tunnel.tunnelType === 'pty') return 'Terminal on this computer'
  return `localhost:${tunnel.port}`
}

function useCopy() {
  const [copied, setCopied] = useState<string | null>(null)
  const copy = async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(key)
      window.setTimeout(() => setCopied(current => current === key ? null : current), 1500)
    } catch { /* clipboard unavailable */ }
  }
  return { copied, copy }
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
    const finish = () => { setEditing(false); onRename(value) }
    return (
      <input
        autoFocus
        className="ps-input ps-panel-rename"
        value={value}
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
        Rename
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

function SharePanel(props: Props & { tunnel: PersistentTunnel; onClose: () => void }) {
  const {
    tunnel, onClose, isBusy, clientId, folderShares, tunnelNames, onRenameTunnel,
    portInput, setPortInput, onPortSubmit, portListening, routeRules, onRouteRulesChange, routePortStatus,
    onStartTunnel, onStopTunnel, onPauseTunnel, onDeleteTunnel, onAccessChange, onTunnelUpdated, onViewFeedback,
  } = props
  const [showRoutes, setShowRoutes] = useState(tunnel.pathRoutes.some(route => route.path !== '/'))
  const { copied, copy } = useCopy()
  const type = tunnel.tunnelType ?? 'http'
  const status = shareStatus(tunnel)
  const badge = STATUS_BADGES[status]
  const access = shareAccess(tunnel)
  const folder = folderShares[tunnel.id]
  const name = tunnelNames[tunnel.id]
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
            <NameEditor key={tunnel.id} tunnel={tunnel} name={name} onRename={value => onRenameTunnel(tunnel.id, value)} />
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

          {isGatedType(type) && access === 'private' && tunnel.password && (
            <GuestLinks key={`links-${tunnel.id}`} clientId={clientId} tunnel={tunnel} />
          )}

          {type === 'http' && (
            <PreviewSetting clientId={clientId} tunnel={tunnel} onUpdated={onTunnelUpdated} onViewFeedback={onViewFeedback} />
          )}

          {type === 'folder' ? (
            <Section title="Folder">
              <div className="ps-panel-target">{shareTarget(tunnel, folder)}</div>
              <p className="ps-panel-hint">
                {tunnel.permissions === 'read-write' ? 'Visitors can download and upload.' : 'Visitors can only download.'}
                {folder?.maxDownloads ? ` Up to ${folder.maxDownloads} ${folder.maxDownloads === 1 ? 'download' : 'downloads'}.` : ''}
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

export default function TunnelsPage(props: Props) {
  const {
    persistentTunnels, selectedTunnelId, onSelectTunnel, onStartTunnel, onStopTunnel, onPauseTunnel,
    folderShares, isBusy, onNewTunnel, tunnelNames,
  } = props
  const [openId, setOpenId] = useState<string | null>(null)
  const { copied, copy } = useCopy()
  const openTunnel = openId ? persistentTunnels.find(tunnel => tunnel.id === openId) : undefined

  const open = (tunnel: PersistentTunnel) => {
    if (tunnel.id !== selectedTunnelId) onSelectTunnel(tunnel)
    setOpenId(tunnel.id)
  }

  return (
    <div className="ps-main">
      <div className="ps-page-header animate-fade-down">
        <div>
          <h1 className="ps-page-title">Shares</h1>
          <p className="ps-page-subtitle">
            {persistentTunnels.length === 0 ? 'Ports, terminals and folders you share' : 'Click a share to change who can open it and more'}
          </p>
        </div>
      </div>

      <div className="ps-page-content">
        {persistentTunnels.length === 0 ? (
          <div className="ps-card animate-fade-up">
            <div className="ps-empty">
              <span className="ps-empty-title">Nothing shared yet</span>
              <span className="ps-empty-sub">Share a local port, terminal or folder through a link.</span>
              <button className="ps-btn ps-btn-primary" onClick={onNewTunnel} style={{ marginTop: 8 }}>
                New share
              </button>
            </div>
          </div>
        ) : (
          <ul className="ps-card ps-share-list animate-fade-up">
            {persistentTunnels.map(tunnel => {
              const status = shareStatus(tunnel)
              const type = tunnel.tunnelType ?? 'http'
              const name = tunnelNames[tunnel.id]
              const address = shareAddress(tunnel)
              const details = [
                name ? address : null,
                TYPE_LABELS[type],
                shareTarget(tunnel, folderShares[tunnel.id]),
                isGatedType(type) ? (shareAccess(tunnel) === 'private' ? 'Password' : 'Public') : null,
              ].filter(Boolean).join(' · ')
              return (
                <li key={tunnel.id} className={`ps-share-row ${openId === tunnel.id ? 'open' : ''}`}>
                  <button
                    type="button"
                    className="ps-share-row-main"
                    onClick={() => open(tunnel)}
                    aria-label={`Open settings for ${name || address}`}
                  >
                    <span className={`ps-share-dot ${status}`} aria-hidden="true" />
                    <span className="ps-share-row-text">
                      <span className="ps-share-row-name">
                        {name || address}
                        <span className={`ps-share-row-status ${status}`}>{STATUS_BADGES[status].label}</span>
                      </span>
                      <span className="ps-share-row-sub">{details}</span>
                    </span>
                  </button>
                  <div className="ps-share-row-actions">
                    <button
                      type="button"
                      className="ps-btn ps-btn-ghost ps-btn-sm"
                      onClick={() => void copy(tunnel.id, shareUrl(tunnel))}
                      aria-label={`Copy link for ${name || address}`}
                    >
                      {copied === tunnel.id ? 'Copied' : 'Copy link'}
                    </button>
                    {tunnel.paused && status !== 'expired' ? (
                      <button type="button" className="ps-btn ps-btn-secondary ps-btn-sm ps-share-run" onClick={() => onPauseTunnel(tunnel, false)} disabled={isBusy}>Resume</button>
                    ) : tunnel.active ? (
                      <button type="button" className="ps-btn ps-btn-secondary ps-btn-sm ps-share-run" onClick={() => onStopTunnel(tunnel)} disabled={isBusy}>Stop</button>
                    ) : (
                      <button type="button" className="ps-btn ps-btn-primary ps-btn-sm ps-share-run" onClick={() => onStartTunnel(tunnel)} disabled={isBusy || status === 'expired'}>Start</button>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      {openTunnel && <SharePanel {...props} tunnel={openTunnel} onClose={() => setOpenId(null)} />}
    </div>
  )
}
