import type { ConnectionState, RequestLogEntry } from '../../lib/api'

type Props = {
  connState: ConnectionState
  port: string
  /** Set for folder shares, which serve a folder instead of forwarding a port. */
  folder?: string
  publicUrl: string
  requestLog: RequestLogEntry[]
}

const statusText: Record<ConnectionState, string> = {
  idle: 'Idle',
  connecting: 'Connecting...',
  connected: 'Tunnel established',
  disconnected: 'Reconnecting...',
}

export default function TunnelConsole({ connState, port, folder, publicUrl, requestLog }: Props) {
  return (
    <div className="ps-tunnel-console animate-fade-up delay-100" aria-label="Tunnel terminal output">
      <div className="ps-tunnel-console-header">
        <span className="ps-tunnel-console-dot red" />
        <span className="ps-tunnel-console-dot yellow" />
        <span className="ps-tunnel-console-dot green" />
        <span className="ps-tunnel-console-title">Kexoz - tunnel</span>
      </div>
      <div className="ps-tunnel-console-body">
        {folder ? (
          <div><span className="ps-tunnel-console-prompt">&gt;</span> share folder</div>
        ) : (
          <div><span className="ps-tunnel-console-prompt">&gt;</span> kexoz connect --port {port || '3000'}</div>
        )}
        <div className="ps-tunnel-console-muted">{statusText[connState]}</div>
        {publicUrl && <div className="ps-tunnel-console-url">{publicUrl}</div>}
        <div>{folder ? `Serving -> ${folder}` : `Forwarding -> localhost:${port || '3000'}`}</div>
        <div className="ps-tunnel-console-divider" />
        {requestLog.length === 0 ? (
          <div className="ps-tunnel-console-muted">Waiting for requests...</div>
        ) : (
          requestLog.slice(-5).reverse().map(entry => (
            <div className="ps-tunnel-console-request" key={entry.id}>
              <span className={`method-tag method-tag-${entry.method.toLowerCase()}`}>{entry.method}</span>
              <span>{entry.path}</span>
              <span className="ps-tunnel-console-status">{entry.status ?? 'ERR'}</span>
              <span className="ps-tunnel-console-muted">{entry.durationMs ?? '-'}ms</span>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
