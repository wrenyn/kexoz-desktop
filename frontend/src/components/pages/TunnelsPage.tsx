import { useState, type FormEvent } from 'react'
import type { PersistentTunnel } from '../../lib/api'
import { ROOT_DOMAIN } from '../../lib/api'
import { STATUS_BADGES, TYPE_LABELS, shareAccess, shareStatus, shareUrl, type FolderShareConfig } from '../../lib/shares'
import RouteRulesEditor from '../dashboard/RouteRulesEditor'

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
  gauthEnabled: boolean
  onAuthToggle: () => void
}

function AccessBadge({ tunnel }: { tunnel: PersistentTunnel }) {
  const access = shareAccess(tunnel)
  return (
    <span
      className={`ps-badge ${access === 'public' ? 'ps-badge-public' : 'ps-badge-private'}`}
      title={access === 'public' ? 'Anyone with the link can open this share' : 'Visitors must sign in or enter a password'}
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
      <button className="ps-rename-btn" onClick={(e) => { e.stopPropagation(); setEditing(true); setValue(customName ?? '') }} title="Rename share">
        Rename
      </button>
    </div>
  )
}

export default function TunnelsPage({
  portInput, setPortInput, onPortSubmit,
  routeRules, onRouteRulesChange, routePortStatus, portListening, isBusy, onNewTunnel,
  persistentTunnels, selectedTunnelId, onSelectTunnel, onStartTunnel, onStopTunnel, onDeleteTunnel, onPauseTunnel,
  folderShares, tunnelNames, onRenameTunnel, gauthEnabled, onAuthToggle
}: Props) {
  const [showRoutes, setShowRoutes] = useState(false)
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
          <p className="ps-page-subtitle">Ports, terminals and folders you've shared from this device</p>
        </div>
        <div className="ps-header-actions">
          <button className="ps-btn ps-btn-primary ps-btn-sm" onClick={onNewTunnel}>
            New share
          </button>
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
          <div className="ps-card ps-saved-tunnels animate-fade-up">
            <div className="ps-saved-tunnel-list">
              {persistentTunnels.map(tunnel => {
                const selected = tunnel.id === selectedTunnelId
                const status = shareStatus(tunnel)
                const badge = STATUS_BADGES[status]
                const type = tunnel.tunnelType ?? 'http'
                const hasPortSettings = selected && type !== 'folder' && type !== 'pty'
                return (
                  <div key={tunnel.id} className={`ps-saved-tunnel-wrap ${selected ? 'selected' : ''}`}>
                    <div
                      className={`ps-saved-tunnel ${selected ? 'selected' : ''}`}
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
                          {copiedId === tunnel.id ? 'Copied' : 'Copy link'}
                        </button>
                        <a
                          href={shareUrl(tunnel)}
                          target="_blank"
                          rel="noreferrer"
                          className="ps-btn ps-btn-ghost ps-btn-sm"
                          onClick={event => event.stopPropagation()}
                        >
                          Open
                        </a>
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
                        <button
                          className="ps-btn ps-btn-ghost ps-btn-sm ps-btn-text-danger"
                          onClick={event => { event.stopPropagation(); onDeleteTunnel(tunnel) }}
                          disabled={isBusy}
                          aria-label={`Delete share ${tunnel.subdomain}`}
                        >
                          Delete
                        </button>
                      </div>
                    </div>

                    {hasPortSettings && (
                      <div className="ps-saved-tunnel-settings">
                        <form onSubmit={onPortSubmit} className="ps-saved-tunnel-port">
                          <label className="ps-label" htmlFor={`port-${tunnel.id}`}>Forwarding to</label>
                          <div className="ps-input-group" style={{ width: 200 }}>
                            <span className="ps-input-prefix">localhost:</span>
                            <input
                              id={`port-${tunnel.id}`}
                              className="ps-input ps-input-mono"
                              value={portInput}
                              onChange={e => setPortInput(e.target.value)}
                              placeholder="3000"
                              type="number"
                              min={1}
                              max={65535}
                            />
                          </div>
                          <button type="submit" className="ps-btn ps-btn-secondary ps-btn-sm" disabled={isBusy}>
                            Apply
                          </button>
                          {portListening !== null && (
                            <span className={`ps-port-status ${portListening ? 'listening' : 'offline'}`}>
                              {portListening ? 'Listening' : 'Not listening'}
                            </span>
                          )}
                          {type === 'http' && (
                            <button
                              type="button"
                              className="ps-btn ps-btn-ghost ps-btn-sm"
                              style={{ marginLeft: 'auto' }}
                              onClick={() => setShowRoutes(v => !v)}
                            >
                              {showRoutes ? 'Hide path routing' : 'Path routing'}
                            </button>
                          )}
                        </form>
                        {type === 'http' && showRoutes && (
                          <RouteRulesEditor rules={routeRules} onChange={onRouteRulesChange} portStatus={routePortStatus} />
                        )}
                        {type === 'http' && gauthEnabled && (
                          <div className="ps-saved-tunnel-option">
                            <div>
                              <div className="ps-settings-row-label">Require Google sign-in</div>
                              <div className="ps-settings-row-desc">Visitors sign in before they can open this link</div>
                            </div>
                            <label className="ps-toggle">
                              <input type="checkbox" checked={tunnel.requireAuth} onChange={onAuthToggle} disabled={isBusy} aria-label="Require Google sign-in" />
                              <div className="ps-toggle-track" />
                            </label>
                          </div>
                        )}
                        {type === 'e2e' && (
                          <div>
                            <div className="ps-settings-row-desc" style={{ marginBottom: 6 }}>Run this with the Kexoz CLI for end-to-end encryption</div>
                            <div className="ps-code">kexoz proxy --port {portInput || tunnel.port} --subdomain {tunnel.subdomain}</div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
