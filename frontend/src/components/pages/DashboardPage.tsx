import { type FormEvent, useState } from 'react'
import { Area, AreaChart, ResponsiveContainer, Tooltip } from 'recharts'
import type { ClientSession, ConnectionState, RequestLogEntry, TunnelType, UsagePoint } from '../../lib/api'
import { ROOT_DOMAIN, tierOf } from '../../lib/api'
import type { NewShareRequest } from '../../lib/shares'
import NewShareModal from '../modals/NewShareModal'
import TunnelConsole from '../dashboard/TunnelConsole'
import QrCodePopover from '../dashboard/QrCodePopover'
import { usePortScanner } from '../../hooks/usePortScanner'

type Props = {
  session: ClientSession | null
  connState: ConnectionState
  portInput: string
  setPortInput: (v: string) => void
  onPortSubmit: (e: FormEvent<HTMLFormElement>) => void
  gauthEnabled: boolean
  onAuthToggle: () => void
  isBusy: boolean
  totalRequests: number
  onCopyUrl: () => void
  copyFeedback: 'idle' | 'copied' | 'failed'
  requestLog: RequestLogEntry[]
  bytesIn: number
  bytesOut: number
  dailyUsage: UsagePoint[]
  portListening: boolean | null
  uptimeSeconds: number
  showNewTunnel: boolean
  onOpenNewTunnel: () => void
  onCloseNewTunnel: () => void
  onCreateTunnel: (request: NewShareRequest) => void | Promise<void>
  tunnelType?: TunnelType
  /** Local folder behind the selected share, when it is a folder share on this device. */
  folderPath?: string
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`
}

function formatUptime(seconds: number): string {
  if (seconds < 60) return `${seconds}s`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  return `${h}h ${m}m`
}

const connBadge: Record<ConnectionState, { label: string; cls: string }> = {
  idle:         { label: 'Idle',         cls: 'ps-badge-gray' },
  connecting:   { label: 'Connecting',   cls: 'ps-badge-yellow' },
  connected:    { label: 'Live',         cls: 'ps-badge-green' },
  disconnected: { label: 'Reconnecting', cls: 'ps-badge-yellow' },
}

export default function DashboardPage({
  session, connState, portInput, setPortInput, onPortSubmit,
  gauthEnabled, onAuthToggle, isBusy,
  totalRequests, onCopyUrl, copyFeedback, requestLog, bytesIn, bytesOut, dailyUsage,
  portListening, uptimeSeconds,
  showNewTunnel, onOpenNewTunnel, onCloseNewTunnel, onCreateTunnel, tunnelType, folderPath,
}: Props) {
  const isFolder = tunnelType === 'folder'
  const publicUrl = session?.subdomain
    ? `https://${session.subdomain}.${ROOT_DOMAIN}`
    : null

  const [showQr, setShowQr] = useState<boolean>(false)
  const detectedPorts = usePortScanner(true)

  const bwPct = session
    ? Math.min(100, (session.bandwidthUsed / session.bandwidthLimit) * 100)
    : 0

  const badge = connBadge[connState]
  const tier = session ? tierOf(session) : null
  const TIER_LABEL: Record<string, string> = {
    anonymous: 'Guest', verified: 'Verified', pro: 'Pro', pro_plus: 'Pro+',
  }

  return (
    <div className="ps-main">
      {/* Header */}
      <div className="ps-page-header animate-fade-down">
        <div>
          <h1 className="ps-page-title">Dashboard</h1>
          <p className="ps-page-subtitle">Your public link and what's coming through it</p>
        </div>
        <div className="ps-header-actions">
          <button className="ps-btn ps-btn-primary ps-btn-sm" onClick={onOpenNewTunnel}>
            New share
          </button>
        </div>
      </div>

      <div className="ps-page-content">
        <div className="ps-dashboard-grid">
          {/* ── Left Column: Tunnel Config ── */}
          <div className={`ps-tunnel-card ${connState === 'connected' ? 'tunnel-connected' : ''} animate-fade-up`}>
            {/* URL row */}
            <div className="ps-tunnel-card-header">
              <div style={{ flex: 1, minWidth: 0 }}>
                {publicUrl ? (
                  <>
                    <div
                      className="ps-tunnel-url"
                      onClick={onCopyUrl}
                      title="Click to copy"
                      style={{ cursor: 'pointer' }}
                    >
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                        {publicUrl}
                      </span>
                      <button type="button" onClick={(e) => { e.stopPropagation(); setShowQr(v => !v); }} style={{ background: 'transparent', border: 'none', color: 'var(--text-soft)', cursor: 'pointer', padding: '2px 4px', fontSize: 11, fontFamily: 'inherit' }}>QR</button>
                      <span style={{ fontSize: 11, color: copyFeedback === 'copied' ? 'var(--green)' : 'var(--text-soft)', flexShrink: 0, marginLeft: 4 }}>
                        {copyFeedback === 'copied' ? 'Copied' : 'Copy'}
                      </span>
                    </div>
                    {showQr && publicUrl && <QrCodePopover url={publicUrl} />}
                  </>
              ) : (
                <div style={{ color: 'var(--text-soft)', fontSize: 12 }}>
                  No subdomain configured
                </div>
              )}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {/* Tunnel mode trust badge */}
              {(() => {
                const modeMap = {
                  http:  { label: 'HTTP', color: 'var(--text-soft)' },
                  e2e:   { label: 'Private E2E', color: 'var(--cyan)' },
                  tcp:   { label: 'TCP', color: 'var(--blue)' },
                  udp:   { label: 'UDP', color: 'var(--blue)' },
                  pty:   { label: 'Terminal', color: 'var(--yellow)' },
                  folder: { label: 'Folder', color: 'var(--sky)' },
                }
                const mode = modeMap[tunnelType as keyof typeof modeMap] ?? modeMap.http
                return (
                  <span className="ps-trust-badge" style={{ color: mode.color, borderColor: `${mode.color}44`, background: `${mode.color}11` }} title={`Tunnel mode: ${mode.label}`}>
                    {mode.label}
                  </span>
                )
              })()}
              <span className={`ps-badge ${badge.cls} ${connState === 'connected' ? 'ps-badge-live-pulse' : ''}`}>{badge.label}</span>
            </div>
          </div>

          <div className="ps-tunnel-card-body">
            {isFolder ? (
              <div className="ps-input-wrap">
                <span className="ps-label">Shared folder</span>
                <span className="ps-folder-path">{folderPath ?? 'Shared from another device'}</span>
              </div>
            ) : (
            <form onSubmit={onPortSubmit}>
              <div className="ps-input-wrap">
                <label className="ps-label">Local port</label>
                <div style={{ display: 'flex', gap: 6 }}>
                  <div className="ps-input-group" style={{ flex: 1 }}>
                    <span className="ps-input-prefix">:</span>
                    <input
                      className="ps-input"
                      value={portInput}
                      onChange={e => setPortInput(e.target.value.replace(/\D/g, ''))}
                      placeholder="3000"
                      disabled={isBusy}
                    />
                  </div>
                  <button
                    type="submit"
                    className="ps-btn ps-btn-secondary"
                    disabled={isBusy}
                  >
                    Apply
                  </button>
                </div>
                {portListening !== null && (
                  <span className={`ps-port-status ${portListening ? 'listening' : 'offline'}`} style={{ marginTop: 4 }}>
                    {portListening ? 'Listening' : 'Not listening'}
                  </span>
                )}
                
                {detectedPorts.length > 0 && !portInput && (
                  <div className="ps-quickconnect-cta">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text)', lineHeight: 1.3 }}>
                          {detectedPorts[0].label} detected on :{detectedPorts[0].port}
                        </div>
                        {detectedPorts.length > 1 && (
                          <div style={{ fontSize: 11, color: 'var(--text-soft)', marginTop: 2 }}>
                            +{detectedPorts.length - 1} more service{detectedPorts.length > 2 ? 's' : ''}
                          </div>
                        )}
                      </div>
                    </div>
                    <button
                      type="button"
                      className="ps-btn ps-btn-primary ps-btn-sm"
                      onClick={() => setPortInput(String(detectedPorts[0].port))}
                    >
                      Use this port
                    </button>
                  </div>
                )}
                {detectedPorts.length > 0 && portInput && (
                  <div className="ps-detected-ports">
                    <span className="ps-label" style={{ fontSize: 10.5 }}>Detected services</span>
                    <div className="ps-detected-list">
                      {detectedPorts.map(({ port, label }) => (
                        <button
                          key={port}
                          className="ps-detected-item"
                          type="button"
                          onClick={() => setPortInput(String(port))}
                        >
                          <span className="ps-detected-port">:{port}</span>
                          <span className="ps-detected-label">{label}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </form>
            )}

            {/* Google Auth toggle */}
            {gauthEnabled && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 20 }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>
                      Auth wall
                    </div>
                    <div style={{ fontSize: 11.5, color: 'var(--text-soft)', marginTop: 2 }}>
                      {session?.requireAuth ? 'Requires Google sign-in' : 'Public access'}
                    </div>
                  </div>
                  <label className="ps-toggle">
                    <input
                      type="checkbox"
                      checked={session?.requireAuth ?? false}
                      onChange={onAuthToggle}
                      disabled={isBusy}
                    />
                    <div className="ps-toggle-track" />
                  </label>
                </div>
              )}
            </div>

            <div className="ps-stat-cards">
              <div className="ps-stat-card">
                <div className="ps-stat-card-value">{totalRequests.toLocaleString()}</div>
                <div className="ps-stat-card-label">Requests</div>
              </div>
              <div className="ps-stat-card">
                <div className="ps-stat-card-value">{formatBytes(bytesIn + bytesOut)}</div>
                <div className="ps-stat-card-label">Transferred</div>
              </div>
              <div className="ps-stat-card">
                <div className="ps-stat-card-value">{connState === 'connected' ? formatUptime(uptimeSeconds) : '—'}</div>
                <div className="ps-stat-card-label">Uptime</div>
              </div>
            </div>
          </div>

          {/* ── Right Column: Bandwidth ── */}
          {session && (
            <div className="ps-card animate-fade-up delay-100" style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <div>
                  <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-muted)' }}>Bandwidth</span>
                  {tier && (
                    <span className="ps-badge ps-badge-gray" style={{ marginLeft: 8 }}>{TIER_LABEL[tier]}</span>
                  )}
                </div>
                <span style={{ fontSize: 11, fontFamily: 'var(--mono-font)', color: 'var(--text-soft)' }}>
                  {formatBytes(session.bandwidthUsed)} / {formatBytes(session.bandwidthLimit)}
                </span>
              </div>
              <div className="ps-bandwidth-bar">
                <div className="ps-bandwidth-fill" style={{ width: `${bwPct}%` }} />
              </div>
              
              <div style={{ height: 70, marginTop: 16, width: '100%' }}>
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={
                    dailyUsage.length > 0 
                      ? [...dailyUsage].reverse().map(p => ({ time: p.period, bytes: p.totalBytes }))
                      : Array.from({ length: 7 }).map((_, i) => ({ time: `Day ${i}`, bytes: 0 }))
                  }>
                    <defs>
                      <linearGradient id="colorBw" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="var(--green)" stopOpacity={0.2}/>
                        <stop offset="95%" stopColor="var(--green)" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <Tooltip
                      contentStyle={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 6, fontSize: 12, boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                      itemStyle={{ color: 'var(--text)' }}
                      formatter={(val: unknown) => [formatBytes(Number(val)), 'Traffic']}
                      labelStyle={{ color: 'var(--text-soft)', marginBottom: 4 }}
                    />
                    <Area type="monotone" dataKey="bytes" stroke="var(--green)" fillOpacity={1} fill="url(#colorBw)" strokeWidth={1.5} isAnimationActive={false} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
              <div style={{ marginTop: 12, fontSize: 11, color: 'var(--text-soft)', textAlign: 'right' }}>
                {(100 - bwPct).toFixed(1)}% remaining this period
              </div>
            </div>
          )}
        </div>



        {/* ── Live console ── */}
        {session?.subdomain && (!tunnelType || tunnelType === 'http' || tunnelType === 'folder' || tunnelType === 'tcp' || tunnelType === 'udp') && (
          <TunnelConsole
            connState={connState}
            port={portInput}
            folder={isFolder ? folderPath ?? 'a folder on another device' : undefined}
            publicUrl={publicUrl ?? ''}
            requestLog={requestLog}
          />
        )}

        {/* ── E2E CLI info ── */}
        {session?.subdomain && tunnelType === 'e2e' && (
          <div className="ps-card animate-fade-up delay-100" style={{ padding: '16px 20px' }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 8 }}>
              Run this with the CLI for end-to-end encryption
            </div>
            <div className="ps-code">
              kexoz proxy --port {portInput || '443'} --subdomain {session.subdomain}
            </div>
          </div>
        )}
      </div>

      {showNewTunnel && session && (
        <NewShareModal
          onClose={onCloseNewTunnel}
          tier={tierOf(session)}
          onSubmit={onCreateTunnel}
        />
      )}
    </div>
  )
}
