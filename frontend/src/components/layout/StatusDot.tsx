import type { ConnectionState } from '../../lib/api'

type StatusDotProps = { state: ConnectionState | 'loading' }

export default function StatusDot({ state }: StatusDotProps) {
  const className = state === 'connected' ? 'status-dot connected'
    : state === 'connecting' || state === 'loading' ? 'status-dot loading'
    : 'status-dot disconnected'
  return <span className={className} />
}
