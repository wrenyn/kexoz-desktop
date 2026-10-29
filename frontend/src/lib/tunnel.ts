import type { RequestLogEntry, ConnectionState } from './api'

type CreateTunnelArgs = {
  apiBaseUrl: string
  clientId: string
  tunnelId?: string
  tunnelType?: string
  portRef: React.MutableRefObject<number | null>
  onStateChange: (state: ConnectionState, message?: string) => void
  onLogEntry: (entry: RequestLogEntry) => void
}

/** Dev-server chatter that inflates request counts without real payload. */
export function isNoiseRequestPath(path: string): boolean {
  const pathname = path.split('?')[0]?.toLowerCase() ?? ''
  return (
    pathname.startsWith('/_next/') ||
    pathname.startsWith('/assets/') ||
    pathname.includes('/_next/webpack-hmr') ||
    pathname.endsWith('/__webpack_hmr') ||
    pathname.includes('/.well-known/') ||
    pathname === '/favicon.ico'
  )
}

type ConnectionHandlers = Pick<CreateTunnelArgs, 'onStateChange' | 'onLogEntry'>

const handlers = new Map<string, ConnectionHandlers>()
let subscribed = false

/** One IPC listener for every share; events are routed by connection key. */
function subscribe() {
  if (subscribed || !window.kexoz) return
  subscribed = true
  window.kexoz.onTunnelState?.((key, state, reason) => handlers.get(key)?.onStateChange(state, reason))
  window.kexoz.onLogEntry?.((key, entry) => handlers.get(key)?.onLogEntry(entry))
}

export function createTunnelConnection({ apiBaseUrl, clientId, tunnelId, tunnelType, portRef, onStateChange, onLogEntry }: CreateTunnelArgs) {
  const protocol = apiBaseUrl.startsWith('https') ? 'wss' : 'ws'
  const tunnelParam = tunnelId ? `&tunnelId=${encodeURIComponent(tunnelId)}` : ''
  // proto=3 signals Yamux over WebSocket
  const tunnelUrl = `${protocol}://${new URL(apiBaseUrl).host}/tunnel/connect?clientId=${encodeURIComponent(clientId)}${tunnelParam}&proto=3`
  const key = tunnelId ?? 'legacy'

  if (!window.kexoz?.startTunnel) {
    return { close: () => {}, setPort: () => {} }
  }

  subscribe()
  const entry: ConnectionHandlers = { onStateChange, onLogEntry }
  handlers.set(key, entry)
  void window.kexoz.startTunnel({ key, tunnelUrl, tunnelType, port: portRef.current ?? 3000 })

  const isCurrent = () => handlers.get(key) === entry
  return {
    close: () => {
      // A newer connection for the same share may already have replaced this one.
      if (!isCurrent()) return
      handlers.delete(key)
      void window.kexoz?.stopTunnel?.(key)
    },
    setPort: (port: number) => {
      if (isCurrent()) void window.kexoz?.setTunnelPort?.(key, port)
    },
  }
}
