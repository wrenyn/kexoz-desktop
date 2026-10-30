import { useEffect, useState } from 'react'
import { API_BASE_URL, type PersistentTunnel } from '../../lib/api'
import { extraRoutes, shareUrl } from '../../lib/shares'
import { shareHealth, type ConnectionEvent } from '../../hooks/useConnectionHistory'

type Props = {
  tunnels: PersistentTunnel[]
  events: ConnectionEvent[]
}

type Check = { label: string; ok: boolean; detail: string }

function duration(ms: number): string {
  const minutes = Math.floor(ms / 60000)
  if (minutes < 1) return 'under a minute'
  if (minutes < 60) return `${minutes} min`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} h ${minutes % 60} min`
  return `${Math.floor(hours / 24)} d ${hours % 24} h`
}

const STATE_LABEL = {
  connected: { text: 'Connected', className: 'ps-badge-green' },
  connecting: { text: 'Connecting', className: 'ps-badge-yellow' },
  disconnected: { text: 'Reconnecting', className: 'ps-badge-red' },
  idle: { text: 'Not connected', className: 'ps-badge-gray' },
} as const

export default function ConnectionPanel({ tunnels, events }: Props) {
  const [now, setNow] = useState(() => Date.now())
  const [checks, setChecks] = useState<Check[] | null>(null)
  const [running, setRunning] = useState(false)
  const [showEvents, setShowEvents] = useState(false)

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 30000)
    return () => window.clearInterval(id)
  }, [])

  const live = tunnels.filter(tunnel => tunnel.active)
  const names = new Map(tunnels.map(tunnel => [tunnel.id, shareUrl(tunnel).replace(/^\w+:\/\//, '')]))
  const drops = events.filter(event => event.state === 'disconnected').slice(-10).reverse()

  const diagnose = async () => {
    setRunning(true)
    setChecks(null)
    try {
      const ports = [...new Set(live.flatMap(t => [t.port, ...extraRoutes(t).map(route => route.port)]))]
      if (!window.kexoz?.diagnose) {
        const start = Date.now()
        const ok = await fetch(`${API_BASE_URL}/health/live`).then(res => res.ok).catch(() => false)
        setChecks([{ label: 'Kexoz servers', ok, detail: ok ? `Reachable in ${Date.now() - start} ms` : 'Could not reach the servers' }])
        return
      }
      const result = await window.kexoz.diagnose({ apiBase: API_BASE_URL, ports })
      const next: Check[] = [
        { label: 'Internet', ok: result.online, detail: result.online ? 'This computer is online' : 'This computer looks offline' },
        { label: 'DNS', ok: result.dns.ok, detail: result.dns.ok ? `${result.dns.detail} (${result.dns.ms} ms)` : `Lookup failed: ${result.dns.detail}` },
        { label: 'Kexoz servers', ok: result.api.ok, detail: result.api.ok ? `Reachable in ${result.api.ms} ms` : `Not reachable: ${result.api.detail}` },
        ...result.ports.map(item => ({
          label: `localhost:${item.port}`,
          ok: item.open,
          detail: item.open ? 'Your app is answering' : 'Nothing is running on this port, so visitors see an error',
        })),
      ]
      if (result.proxy) next.push({ label: 'Proxy', ok: true, detail: `${result.proxy}. If shares keep dropping, try without it.` })
      setChecks(next)
    } catch (err) {
      setChecks([{ label: 'Diagnostics', ok: false, detail: err instanceof Error ? err.message : 'Could not run the checks' }])
    } finally {
      setRunning(false)
    }
  }

  return (
    <div className="ps-card ps-overview-card">
      <div className="ps-overview-card-head">
        <div>
          <div className="ps-overview-card-title">Connection</div>
          <div className="ps-overview-card-sub">Status of running shares over the last 24 hours</div>
        </div>
        <button className="ps-btn ps-btn-secondary ps-btn-sm" onClick={() => void diagnose()} disabled={running}>
          {running ? 'Checking…' : 'Run diagnostics'}
        </button>
      </div>

      {live.length === 0 ? (
        <div className="ps-overview-empty">No shares are running.</div>
      ) : (
        <div className="ps-conn-rows">
          {live.map(tunnel => {
            const health = shareHealth(events, tunnel.id, now)
            const label = STATE_LABEL[health.state]
            const uptime = health.watchedMs > 0 ? Math.round((health.upMs / health.watchedMs) * 1000) / 10 : null
            return (
              <div key={tunnel.id} className="ps-conn-row">
                <div className="ps-conn-main">
                  <span className="ps-conn-name">{names.get(tunnel.id)}</span>
                  <span className="ps-overview-card-sub">
                    {health.state === 'connected' && health.connectedSince ? `Connected for ${duration(now - health.connectedSince)}` : label.text}
                    {uptime !== null && ` · ${uptime}% uptime`}
                    {` · ${health.reconnects} ${health.reconnects === 1 ? 'reconnect' : 'reconnects'}`}
                  </span>
                  {health.lastReason && health.lastDropAt && (
                    <span className="ps-conn-reason">Last drop {new Date(health.lastDropAt).toLocaleTimeString()}: {health.lastReason}</span>
                  )}
                </div>
                <span className={`ps-badge ${label.className}`}>{label.text}</span>
              </div>
            )
          })}
        </div>
      )}

      {checks && (
        <ul className="ps-diag">
          {checks.map(check => (
            <li key={check.label} className={check.ok ? 'ok' : 'bad'}>
              <span className="ps-diag-state">{check.ok ? 'OK' : 'Problem'}</span>
              <span className="ps-diag-label">{check.label}</span>
              <span className="ps-diag-detail">{check.detail}</span>
            </li>
          ))}
        </ul>
      )}

      {drops.length > 0 && (
        <div className="ps-conn-history">
          <button type="button" className="ps-ns-more" onClick={() => setShowEvents(v => !v)} aria-expanded={showEvents}>
            {showEvents ? 'Hide recent drops' : `Recent drops (${drops.length})`}
          </button>
          {showEvents && (
            <ul className="ps-conn-events">
              {drops.map(event => (
                <li key={`${event.key}-${event.at}`}>
                  <span className="ps-conn-time">{new Date(event.at).toLocaleString()}</span>
                  <span>{names.get(event.key) ?? 'Deleted share'}</span>
                  <span className="ps-conn-reason">{event.reason || 'Connection closed'}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
