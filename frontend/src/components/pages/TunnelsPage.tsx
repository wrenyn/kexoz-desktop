import { useState, type FormEvent } from 'react'
import { AlertTriangle, Edit2 } from 'lucide-react'
import type { ClientSession, ConnectionState, PersistentTunnel } from '../../lib/api'
import { ROOT_DOMAIN } from '../../lib/api'
import { STATUS_BADGES, TYPE_LABELS, shareAccess, shareHost, shareStatus, shareUrl, type FolderShareConfig } from '../../lib/shares'
import RouteRulesEditor from '../dashboard/RouteRulesEditor'

type Props = {
  session: ClientSession | null
  connState: ConnectionState
  portInput: string
  setPortInput: (v: string) => void
  onPortSubmit: (e: FormEvent<HTMLFormElement>) => void
  onCopyUrl: () => void
  copyFeedback: 'idle' | 'copied' | 'failed'
  
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
}

function AccessBadge({ tunnel }: { tunnel: PersistentTunnel }) {
  const access = shareAccess(tunnel)
  return (
    <span
      className={`ps-badge ${access === 'public' ? 'ps-badge-public' : 'ps-badge-private'}`}
      title={access === 'public' ? 'Anyone with the link can reach this share' : 'Visitors must sign in or enter a password'}
    >
      {access === 'public' ? 'Public' : 'Private'}
    </span>
  )
}

function shareDetail(tunnel: PersistentTunnel, folder?: FolderShareConfig): string {
  const parts = [TYPE_LABELS[tunnel.tunnelType ?? 'http']]
  if (tunnel.tunnelType === 'folder') {
    parts.push(folder?.root ?? 'Folder on another device')
  } else {
    parts.push(`localhost:${tunnel.port}`)
  }
  if (tunnel.permissions === 'read') parts.push(tunnel.tunnelType === 'pty' ? 'View-only' : 'Read-only')
  if (tunnel.tunnelType === 'folder' && tunnel.permissions === 'read-write') parts.push('Read & write')
  if (tunnel.expiresAt && shareStatus(tunnel) !== 'expired') {
    parts.push(`Expires ${new Date(tunnel.expiresAt).toLocaleString()}`)
  }
  return parts.join(' · ')
}

const statusText: Record<ConnectionState, string> = {
  idle:         'Idle',
  connecting:   'Connecting…',
  connected:    'Live',
  disconnected: 'Reconnecting…',
}

function TunnelNameRow({ tunnel, tunnelNames, onRenameTunnel }: { tunnel: PersistentTunnel, tunnelNames: Record<string, string>, onRenameTunnel: (id: string, name: string) => void }) {
  const [editing, setEditing] = useState(false)
  const customName = tunnelNames[tunnel.id]
  const [value, setValue] = useState(customName ?? '')

  if (editing) {
    return (
      <div className="ps-tunnel-name-row">
        <input
          autoFocus
          className="ps-tunnel-rename-input"
          value={value}
          onChange={e => setValue(e.target.value)}
          onBlur={() => { setEditing(false); onRenameTunnel(tunnel.id, value) }}
          onKeyDown={e => {
            if (e.key === 'Enter') {
              setEditing(false);
              onRenameTunnel(tunnel.id, value)
            }
            if (e.key === 'Escape') {
              setEditing(false);
              setValue(customName ?? '')
            }
          }}
          onClick={e => e.stopPropagation()}
        />
      </div>
    )
  }

  return (
    <div className="ps-tunnel-name-row">
      {customName ? (
        <>
          <span className="ps-tunnel-friendly-name">{customName}</span>
          <span style={{ fontSize: 12, color: 'var(--text-soft)' }}>({tunnel.subdomain}.{ROOT_DOMAIN})</span>
        </>
      ) : (
        <strong>{tunnel.subdomain}.{ROOT_DOMAIN}</strong>
      )}
      <button className="ps-rename-btn" onClick={(e) => { e.stopPropagation(); setEditing(true); setValue(customName ?? '') }} title="Rename tunnel">
        <Edit2 size={12} />
      </button>
    </div>
  )
}

export default function TunnelsPage({
  session, connState, portInput, setPortInput, onPortSubmit,
  onCopyUrl, copyFeedback, routeRules, onRouteRulesChange, routePortStatus, portListening, isBusy, onNewTunnel,
  persistentTunnels, selectedTunnelId, onSelectTunnel, onStartTunnel, onStopTunnel, onDeleteTunnel, onPauseTunnel,
  folderShares, tunnelNames, onRenameTunnel
}: Props) {
  const selectedTunnel = persistentTunnels.find(t => t.id === selectedTunnelId)
  const publicUrl = selectedTunnel ? shareUrl(selectedTunnel) : session?.subdomain ? `https://${session.subdomain}.${ROOT_DOMAIN}` : null
  const isConnected = connState === 'connected'
  const isFolder = selectedTunnel?.tunnelType === 'folder'
  const [showRoutes, setShowRoutes] = useState(false)
  // Deleting a saved tunnel removes a persistent configuration, so it takes two
  // clicks instead of one.
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)

  const copyShareUrl = async (tunnel: PersistentTunnel) => {
    try {
      await navigator.clipboard.writeText(shareUrl(tunnel))
      setCopiedId(tunnel.id)
      window.setTimeout(() => setCopiedId(current => current === tunnel.id ? null : current), 1500)
    } catch {
      setCopiedId(null)
    }
  }

  return (
    <div className="ps-main">
      <div className="ps-page-header animate-fade-down">
        <div>
          <h1 className="ps-page-title">Shares</h1>
        </div>
        <div className="ps-header-actions">
          <button className="ps-btn ps-btn-primary ps-btn-sm" onClick={onNewTunnel}>
            New share
          </button>
        </div>
      </div>

      <div className="ps-page-content">
        {/* Saved shares */}
        <div className="ps-card ps-saved-tunnels animate-fade-up">
          <div className="ps-saved-tunnels-heading">
            <div>
              <div className="ps-section-title">Your shares</div>
              <div className="ps-tunnel-card-subtitle">
                Ports, terminals and folders shared from this client
                {persistentTunnels.length > 0 && (
                  <span style={{ color: 'var(--text-soft)', marginLeft: 6 }}>
                    · Export in <strong style={{ color: 'var(--text-muted)' }}>Settings → Tunnel</strong>
                  </span>
                )}
              </div>
            </div>
            <span className="ps-badge ps-badge-gray">{persistentTunnels.length}</span>
          </div>
          {persistentTunnels.length === 0 ? (
            <div className="ps-empty ps-empty-compact">
              <span className="ps-empty-sub">Nothing shared yet. Share a port, terminal or folder to get a link.</span>
            </div>
          ) : (
            <div className="ps-saved-tunnel-list">
              {persistentTunnels.map(tunnel => {
                const selected = tunnel.id === selectedTunnelId
                const status = shareStatus(tunnel)
                const badge = STATUS_BADGES[status]
                return (
                  <div
                    className={`ps-saved-tunnel ${selected ? 'selected' : ''}`}
                    key={tunnel.id}
                    role="button"
                    tabIndex={0}
                    aria-pressed={selected}
                    aria-label={`Select share ${tunnel.subdomain}, ${badge.label.toLowerCase()}, ${shareAccess(tunnel)}`}
                    onClick={() => onSelectTunnel(tunnel)}
                    onKeyDown={event => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault()
                        onSelectTunnel(tunnel)
                      }
                    }}
                  >
                    <span className={`ps-saved-tunnel-dot ${status === 'active' ? 'active' : ''}`} />
                    <div className="ps-saved-tunnel-main">
                      <TunnelNameRow tunnel={tunnel} tunnelNames={tunnelNames} onRenameTunnel={onRenameTunnel} />
                      <small>{shareDetail(tunnel, folderShares[tunnel.id])}</small>
                    </div>
                    <AccessBadge tunnel={tunnel} />
                    <span className={`ps-badge ${badge.className}`}>{badge.label}</span>
                    <div className="ps-saved-tunnel-actions">
                      <button
                        className="ps-btn ps-btn-ghost ps-btn-sm"
                        onClick={event => { event.stopPropagation(); void copyShareUrl(tunnel) }}
                        aria-label={`Copy link for ${tunnel.subdomain}`}
                      >
                        {copiedId === tunnel.id ? 'Copied' : 'Copy URL'}
                      </button>
                      {status !== 'expired' && (
                        <button
                          className="ps-btn ps-btn-secondary ps-btn-sm"
                          onClick={event => { event.stopPropagation(); onPauseTunnel(tunnel, !tunnel.paused) }}
                          disabled={isBusy}
                          title={tunnel.paused ? 'Let visitors in again' : 'Keep the link but refuse visitors'}
                        >
                          {tunnel.paused ? 'Resume' : 'Pause'}
                        </button>
                      )}
                      {tunnel.active ? (
                        <button
                          className="ps-btn ps-btn-secondary ps-btn-sm"
                          onClick={event => { event.stopPropagation(); onStopTunnel(tunnel) }}
                          disabled={isBusy}
                        >
                          Stop
                        </button>
                      ) : (
                        <button
                          className="ps-btn ps-btn-primary ps-btn-sm"
                          onClick={event => { event.stopPropagation(); onStartTunnel(tunnel) }}
                          disabled={isBusy || status === 'expired'}
                        >
                          Start
                        </button>
                      )}
                      {confirmDeleteId === tunnel.id ? (
                        <>
                          <button
                            className="ps-btn ps-btn-sm"
                            style={{ color: 'var(--red)', borderColor: 'var(--red)' }}
                            onClick={event => {
                              event.stopPropagation()
                              setConfirmDeleteId(null)
                              onDeleteTunnel(tunnel)
                            }}
                            disabled={isBusy}
                          >
                            Confirm delete
                          </button>
                          <button
                            className="ps-btn ps-btn-ghost ps-btn-sm"
                            onClick={event => { event.stopPropagation(); setConfirmDeleteId(null) }}
                            disabled={isBusy}
                          >
                            Cancel
                          </button>
                        </>
                      ) : (
                        <button
                          className="ps-btn ps-btn-ghost ps-btn-sm"
                          style={{ color: 'var(--red)' }}
                          onClick={event => { event.stopPropagation(); setConfirmDeleteId(tunnel.id) }}
                          disabled={isBusy}
                          aria-label={`Delete share ${tunnel.subdomain}`}
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Active session */}
        {session?.subdomain ? (
          <>
            <div className={`ps-tunnel-card ${isConnected ? 'tunnel-connected' : ''} animate-fade-up`}>
              <div className="ps-tunnel-card-header">
                <div style={{
                  width: 7, height: 7, borderRadius: '50%', flexShrink: 0,
                  background: isConnected ? 'var(--green)' : 'var(--yellow)',
                }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--text)', letterSpacing: '-0.01em' }}>
                    {selectedTunnel ? shareHost(selectedTunnel) : `${session.subdomain}.${ROOT_DOMAIN}`}
                  </div>
                  <div className={isFolder ? 'ps-folder-path' : undefined} style={{ fontSize: 11, color: 'var(--text-soft)', fontFamily: 'var(--mono-font)', marginTop: 1 }}>
                    {isFolder
                      ? folderShares[selectedTunnel?.id ?? '']?.root ?? 'Folder on another device'
                      : `localhost:${selectedTunnel?.port ?? session.port ?? '—'}`}
                  </div>
                </div>
                {selectedTunnel && <AccessBadge tunnel={selectedTunnel} />}
                {selectedTunnel?.paused ? (
                  <span className="ps-badge ps-badge-yellow" title="Visitors see a paused page until you resume">Paused</span>
                ) : (
                  <span className={`ps-badge ${isConnected ? 'ps-badge-green' : 'ps-badge-yellow'}`}>
                    {statusText[connState]}
                  </span>
                )}
                <div style={{ display: 'flex', gap: 6 }}>
                  {publicUrl && (
                    <>
                      <button
                        className="ps-btn ps-btn-secondary ps-btn-sm"
                        onClick={selectedTunnel ? () => void copyShareUrl(selectedTunnel) : onCopyUrl}
                      >
                        {(selectedTunnel ? copiedId === selectedTunnel.id : copyFeedback === 'copied') ? 'Copied' : 'Copy URL'}
                      </button>
                      <a href={publicUrl} target="_blank" rel="noreferrer" className="ps-btn ps-btn-secondary ps-btn-sm">
                        Open
                      </a>
                    </>
                  )}
                </div>
              </div>

              {selectedTunnel && shareAccess(selectedTunnel) === 'public' && (
                <div className="ps-exposure-warning" role="status" style={{ margin: '0 16px 12px' }}>
                  <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
                  <span>
                    <strong>Public share.</strong> Anyone with the link can reach this {isFolder ? 'folder' : 'service'}.
                    {selectedTunnel.tunnelType === 'tcp' || selectedTunnel.tunnelType === 'udp' || selectedTunnel.tunnelType === 'e2e'
                      ? ' Kexoz cannot check visitors on this type, so protect the service itself.'
                      : ' Delete and recreate it as private to require sign-in or a password.'}
                  </span>
                </div>
              )}

              {/* Port config */}
              {!isFolder && <div className="ps-tunnel-card-body">
                <form onSubmit={onPortSubmit} style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
                  <div className="ps-input-wrap" style={{ flex: 1, maxWidth: 260 }}>
                    <label className="ps-label">Forwarding to</label>
                    <div className="ps-input-group">
                      <span className="ps-input-prefix">localhost:</span>
                      <input
                        className="ps-input ps-input-mono"
                        value={portInput}
                        onChange={e => setPortInput(e.target.value)}
                        placeholder="3000"
                        type="number"
                        min={1}
                        max={65535}
                      />
                    </div>
                  </div>
                  {portListening !== null && (
                    <span className={`ps-port-status ${portListening ? 'listening' : 'offline'}`} style={{ marginBottom: 2 }}>
                      {portListening ? 'Listening' : 'Not listening'}
                    </span>
                  )}
                  <button type="submit" className="ps-btn ps-btn-secondary ps-btn-sm" disabled={isBusy}>
                    Apply
                  </button>
                </form>

                {(!selectedTunnel?.tunnelType || selectedTunnel.tunnelType === 'http') && (
                  <>
                    <button
                      className="ps-btn ps-btn-ghost ps-btn-sm"
                      style={{ alignSelf: 'flex-start' }}
                      onClick={() => setShowRoutes(v => !v)}
                    >
                      {showRoutes ? 'Hide route rules' : 'Route rules'}
                    </button>
                    {showRoutes && (
                      <RouteRulesEditor rules={routeRules} onChange={onRouteRulesChange} portStatus={routePortStatus} />
                    )}
                  </>
                )}
              </div>}

              <div className="ps-tunnel-card-stats" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
                <div className="ps-tunnel-stat">
                  <span className="ps-tunnel-stat-label">Type</span>
                  <span className="ps-tunnel-stat-value" style={{ fontSize: 14 }}>
                    {TYPE_LABELS[selectedTunnel?.tunnelType ?? 'http']}
                  </span>
                </div>
                <div className="ps-tunnel-stat">
                  <span className="ps-tunnel-stat-label">Plan</span>
                  <span className="ps-tunnel-stat-value" style={{ fontSize: 14, textTransform: 'capitalize' }}>{session.plan}</span>
                </div>
                <div className="ps-tunnel-stat">
                  <span className="ps-tunnel-stat-label">Permissions</span>
                  <span className="ps-tunnel-stat-value" style={{ fontSize: 14 }}>
                    {selectedTunnel?.permissions === 'read'
                      ? (selectedTunnel.tunnelType === 'pty' ? 'View-only' : 'Read-only')
                      : 'Read & write'}
                  </span>
                </div>
                <div className="ps-tunnel-stat">
                  <span className="ps-tunnel-stat-label">Custom Domain</span>
                  <span className="ps-tunnel-stat-value" style={{ fontSize: 12, color: 'var(--text-soft)' }}>
                    {session.customDomain || 'None'}
                  </span>
                </div>
              </div>
            </div>


          </>
        ) : (
          <div className="ps-card animate-fade-up">
            <div className="ps-empty">
              <span className="ps-empty-title">Nothing shared yet</span>
              <span className="ps-empty-sub">Share a local port, terminal or folder through a link.</span>
              <button className="ps-btn ps-btn-primary" onClick={onNewTunnel} style={{ marginTop: 8 }}>
                New share
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}


