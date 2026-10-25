import type { PersistentTunnel, ShareAccess, SharePermissions, ShareStatus, TunnelType } from './api'
import { ROOT_DOMAIN } from './api'

export type FolderInfo = {
  path: string
  exists: boolean
  isDirectory: boolean
  isDriveRoot: boolean
  isHome: boolean
}

/** Folder shares keep their path on this device; the server never sees it. */
export type FolderShareConfig = {
  root: string
  excludes: string[]
  /** Downloads allowed before the share refuses more; 0 or missing means no limit. */
  maxDownloads?: number
}

export type NewShareRequest = {
  subdomain: string
  tunnelType: TunnelType
  /** Local port for port and terminal shares; ignored for folders. */
  port: number
  access: ShareAccess
  permissions: SharePermissions
  password?: string
  duration?: string
  folder?: FolderShareConfig
  preview?: boolean
  name?: string
  /** The project the share is created in, if any. */
  projectId?: string
}

export const DEFAULT_FOLDER_EXCLUDES = ['.git', 'node_modules']

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
  pty: 'Terminal',
  folder: 'Folder',
}

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

export const projectNameError = (name: string): string =>
  !name.trim() ? 'Give the project a name.'
    : !PROJECT_NAME_PATTERN.test(name.trim().replace(/\s+/g, ' ')) ? 'Use up to 40 letters, numbers, spaces, dashes or underscores.'
    : ''

/** Falls back to the same rule the server uses for records from older servers. */
export const shareAccess = (tunnel: PersistentTunnel): ShareAccess => {
  if (tunnel.access) return tunnel.access
  if (!isGatedType(tunnel.tunnelType)) return 'public'
  return tunnel.requireAuth || tunnel.password || tunnel.tunnelType === 'pty' ? 'private' : 'public'
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

export const parseExcludes = (text: string): string[] =>
  text.split(/[\n,]/).map(pattern => pattern.trim()).filter(Boolean)
