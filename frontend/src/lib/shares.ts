import type { PathRoute, PersistentTunnel, ShareAccess, SharePermissions, ShareStatus, TunnelType } from './api'
import { ROOT_DOMAIN } from './api'

export type NewShareRequest = {
  subdomain: string
  tunnelType: TunnelType
  port: number
  access: ShareAccess
  permissions: SharePermissions
  password?: string
  duration?: string
  preview?: boolean
  name?: string
  /** Paths other than / that go to another local port, like /api → 8080. */
  extraRoutes?: PathRoute[]
  /** The project the share is created in. */
  projectId?: string
  /** Creates this project first when no existing one was picked. */
  newProjectName?: string
  /** Preview environment inside the project; empty is main. */
  environment?: string
}

export const EXPIRY_OPTIONS = [
  { id: '1h', label: '1 hour', duration: '1h' },
  { id: '24h', label: '24 hours', duration: '24h' },
  { id: '7d', label: '7 days', duration: '168h' },
  { id: 'never', label: 'Never', duration: '' },
] as const

export const TYPE_LABELS: Record<TunnelType, string> = {
  http: 'Web',
  e2e: 'Web · end-to-end encrypted',
  tcp: 'TCP',
  udp: 'UDP',
}

/** Share types the app can still run; older folder and terminal shares are ignored. */
export const isSupportedType = (type: string | undefined): boolean =>
  !type || type in TYPE_LABELS

/** The gateway can only check visitors on types where it sees the requests. */
export const isGatedType = (type: TunnelType | undefined): boolean =>
  type !== 'tcp' && type !== 'udp' && type !== 'e2e'

export const shareHost = (tunnel: PersistentTunnel): string =>
  tunnel.customDomain || `${tunnel.subdomain}.${ROOT_DOMAIN}`

export const shareUrl = (tunnel: PersistentTunnel): string => {
  if ((tunnel.tunnelType === 'tcp' || tunnel.tunnelType === 'udp') && tunnel.publicTcpPort) {
    return `${tunnel.tunnelType}://${ROOT_DOMAIN}:${tunnel.publicTcpPort}`
  }
  return `https://${shareHost(tunnel)}`
}

/** The address without the scheme, as people read it. */
export const shareAddress = (tunnel: PersistentTunnel): string =>
  tunnel.subdomain ? `${tunnel.subdomain}.${ROOT_DOMAIN}` : shareUrl(tunnel).replace(/^\w+:\/\//, '')

/** What to call a share: its name, else its address. */
export const shareLabel = (tunnel: PersistentTunnel): string => tunnel.name?.trim() || shareAddress(tunnel)

/** The other running share serving this share's address, if any. */
export const addressHolder = (tunnels: PersistentTunnel[], tunnel: PersistentTunnel): PersistentTunnel | undefined =>
  tunnel.subdomain
    ? tunnels.find(other => other.id !== tunnel.id && other.subdomain === tunnel.subdomain && other.active && !other.paused)
    : undefined

export const PROJECT_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9 _-]{0,39}$/

const ENVIRONMENT_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,22}[a-z0-9])?$/

/** The stored environment name: "main" and blank both mean the project's main one. */
export const environmentName = (raw: string): string => {
  const name = raw.trim().toLowerCase()
  return name === 'main' || name === 'default' ? '' : name
}

export const environmentLabel = (name?: string): string => name || 'main'

export const environmentError = (raw: string): string => {
  const name = environmentName(raw)
  return name === '' || ENVIRONMENT_PATTERN.test(name) ? '' : 'Use up to 24 lowercase letters, numbers or dashes, like staging or pr-12.'
}

export const projectNameError = (name: string): string =>
  !name.trim() ? 'Give the project a name.'
    : !PROJECT_NAME_PATTERN.test(name.trim().replace(/\s+/g, ' ')) ? 'Use up to 40 letters, numbers, spaces, dashes or underscores.'
    : ''

/** Routes other than the / fallback, which always follows the share's port. */
export const extraRoutes = (tunnel: PersistentTunnel): PathRoute[] =>
  (tunnel.pathRoutes ?? []).filter(route => route.path.replace(/\/+$/, '') !== '')

/** Why a route row can't be saved, or '' when it can. */
/** The local port that serves a request path: the longest matching route, else the share's port. */
export const portForPath = (tunnel: PersistentTunnel, requestPath: string): number => {
  const path = requestPath.split('?')[0]
  const route = [...(tunnel.pathRoutes ?? [])]
    .filter(r => r.path !== '/' && (path === r.path || path.startsWith(`${r.path.replace(/\/$/, '')}/`)))
    .sort((a, b) => b.path.length - a.path.length)[0]
  return route?.port ?? tunnel.port
}

export const routeError = (route: PathRoute, others: PathRoute[]): string => {
  const path = route.path.trim().replace(/\/+$/, '')
  if (!path.startsWith('/') || path.length < 2) return 'Start the path with /, like /api.'
  if (/[?#*\s]/.test(path)) return 'Use a plain path prefix, like /api.'
  if (!Number.isInteger(route.port) || route.port < 1 || route.port > 65535) return 'Use a port between 1 and 65535.'
  const clash = others.find(other => {
    const otherPath = other.path.trim().replace(/\/+$/, '')
    return otherPath === path || otherPath.startsWith(`${path}/`) || path.startsWith(`${otherPath}/`)
  })
  return clash ? `Overlaps ${clash.path}.` : ''
}

/** The routes to save for a share: valid extra routes plus the / fallback. */
export const routesForShare = (port: number, extras: PathRoute[]): PathRoute[] => {
  const kept: PathRoute[] = []
  for (const route of extras) {
    const clean = { path: route.path.trim().replace(/\/+$/, ''), port: route.port }
    if (!routeError(clean, kept)) kept.push(clean)
  }
  return [...kept, { path: '/', port }]
}

/** Falls back to the same rule the server uses for records from older servers. */
export const shareAccess = (tunnel: PersistentTunnel): ShareAccess => {
  if (tunnel.access) return tunnel.access
  if (!isGatedType(tunnel.tunnelType)) return 'public'
  return tunnel.requireAuth || tunnel.password ? 'private' : 'public'
}

export const shareStatus = (tunnel: PersistentTunnel): ShareStatus => {
  if (tunnel.status) return tunnel.status
  if (tunnel.paused) return 'paused'
  return tunnel.active ? 'active' : 'stopped'
}

export const STATUS_BADGES: Record<ShareStatus, { label: string; className: string }> = {
  active: { label: 'Running', className: 'ps-badge-green' },
  stopped: { label: 'Stopped', className: 'ps-badge-gray' },
  paused: { label: 'Paused', className: 'ps-badge-yellow' },
  expired: { label: 'Expired', className: 'ps-badge-red' },
}
