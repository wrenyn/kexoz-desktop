import axios from 'axios'
import { parsePort } from './utils'

export type FlowStep = 'loading' | 'gate' | 'subdomain' | 'dashboard'

export type Tier = 'anonymous' | 'verified' | 'pro' | 'pro_plus'

export type ClientSession = {
  id: string
  subdomain: string
  port: number | null
  customDomain: string
  requireAuth: boolean
  plan: string
  bandwidthUsed: number
  bandwidthLimit: number
  ownerEmail: string
  pathRoutes: PathRoute[]
}

export type IdentityResponse = {
  id: string
  subdomain?: string | null
  port?: number | null
  customDomain?: string | null
  requireAuth?: boolean
  plan?: string
  bandwidthUsed?: number
  bandwidthLimit?: number
  ownerEmail?: string | null
  pathRoutes?: PathRoute[]
}

export type AuthResponse = { requireAuth: boolean; gauthEnabled: boolean }

export type AvailabilityResponse = {
  available?: boolean
  exists?: boolean
  reserved?: boolean
}

export type PortResponse = { port?: number }
export type DomainResponse = { customDomain: string }
export type PathRoute = { path: string; port: number }

export type TunnelType = 'http' | 'tcp' | 'udp' | 'e2e' | 'pty' | 'folder'
export type ShareAccess = 'public' | 'private'
export type SharePermissions = 'read' | 'read-write'
export type ShareStatus = 'active' | 'stopped' | 'paused' | 'expired'

export type PersistentTunnel = {
  id: string
  subdomain: string
  customDomain: string
  port: number
  requireAuth: boolean
  pathRoutes: PathRoute[]
  active: boolean
  tunnelType?: TunnelType
  password?: string
  duration?: string
  oneTime?: boolean
  logoUrl?: string
  welcomeMessage?: string
  /** Derived by the server from the auth wall and password. */
  access?: ShareAccess
  /** Derived by the server; paused and expired shares refuse visitors. */
  status?: ShareStatus
  permissions?: SharePermissions
  paused?: boolean
  expiresAt?: string
  createdAt?: string
  publicTcpPort?: number
}

export type NewTunnelInput = Omit<PersistentTunnel, 'id' | 'active' | 'status' | 'paused' | 'expiresAt' | 'createdAt' | 'publicTcpPort'>

export type TunnelRequest = {
  id: string
  method: string
  path: string
  headers: Record<string, string[]>
  body?: string
}

export type RequestLogEntry = {
  id: string
  method: string
  path: string
  status: number | null
  timestamp: string
  durationMs: number | null
  headers?: Record<string, string>
  body?: string
  responseHeaders?: Record<string, string>
  responseBody?: string
}

export type ConnectionState = 'idle' | 'connecting' | 'connected' | 'disconnected'

const defaultOrEnv = (value: string | undefined, defaultValue: string): string => {
  if (value && value.trim()) return value.trim()
  return defaultValue
}

export const API_BASE_URL = defaultOrEnv(import.meta.env.VITE_KEXOZ_API_BASE, 'https://api.kexoz.dev')
export const ROOT_DOMAIN  = defaultOrEnv(import.meta.env.VITE_KEXOZ_ROOT_DOMAIN, 'kexoz.dev')

export const ensureClientIdentity = async (existingId: string | null): Promise<ClientSession> => {
  const payload = existingId ? { id: existingId } : {}
  const { data } = await axios.post<IdentityResponse>(`${API_BASE_URL}/client/identity`, payload)
  if (!data.id) throw new Error('Server did not return a valid client id.')
  return {
    id: data.id,
    subdomain: data.subdomain?.trim().toLowerCase() ?? '',
    port: parsePort(data.port),
    customDomain: data.customDomain?.trim().toLowerCase() ?? '',
    requireAuth: data.requireAuth ?? false,
    plan: data.plan ?? 'free',
    bandwidthUsed: data.bandwidthUsed ?? 0,
    bandwidthLimit: data.bandwidthLimit ?? 104857600,
    ownerEmail: data.ownerEmail?.trim().toLowerCase() ?? '',
    pathRoutes: data.pathRoutes ?? [],
  }
}

/** Account page on the website; `upgrade` opens checkout for that plan. */
export const upgradeUrl = (clientId: string, planId: 'pro' | 'pro_plus'): string =>
  `https://${ROOT_DOMAIN}/account?clientId=${encodeURIComponent(clientId)}&upgrade=${planId}`

export const tierOf = (session: Pick<ClientSession, 'plan' | 'ownerEmail'>): Tier => {
  if (session.plan === 'pro_plus') return 'pro_plus'
  if (session.plan === 'pro') return 'pro'
  if (session.ownerEmail) return 'verified'
  return 'anonymous'
}

export type LinkStatus = {
  linked: boolean
  email: string
  plan: string
  tier: Tier
  bandwidthUsed: number
  bandwidthLimit: number
}

const toBase64Url = (value: string): string =>
  btoa(value).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

/** Browser URL that starts Google sign-in and lands on link-finish for clientId. */
export const googleLinkLoginUrl = (clientId: string): string => {
  const finish = `${API_BASE_URL}/client/link-finish?clientId=${encodeURIComponent(clientId)}`
  return `${API_BASE_URL}/auth/google/login?next=${encodeURIComponent(toBase64Url(finish))}`
}

/** Polled while the user completes Google sign-in in their browser. */
export const fetchLinkStatus = async (clientId: string): Promise<LinkStatus> => {
  const { data } = await axios.get<LinkStatus>(`${API_BASE_URL}/client/link-status`, {
    params: { clientId },
  })
  return data
}

export const checkSubdomainAvailability = async (name: string): Promise<{ available: boolean; reserved: boolean }> => {
  const { data } = await axios.get<AvailabilityResponse>(`${API_BASE_URL}/subdomain/check`, { params: { name } })
  if (typeof data.available === 'boolean') {
    return { available: data.available, reserved: data.reserved === true }
  }
  if (typeof data.exists === 'boolean') return { available: !data.exists, reserved: false }
  throw new Error('Unexpected response while checking subdomain availability.')
}

export const claimSubdomain = async (clientId: string, subdomain: string): Promise<void> => {
  await axios.post(`${API_BASE_URL}/subdomain/claim`, { clientId, subdomain })
}

export const updateExposedPort = async (clientId: string, port: number): Promise<number> => {
  const { data } = await axios.put<PortResponse>(`${API_BASE_URL}/client/port`, { clientId, port })
  return parsePort(data.port) ?? port
}

export const updateCustomDomain = async (clientId: string, domain: string): Promise<string> => {
  const { data } = await axios.put<DomainResponse>(`${API_BASE_URL}/client/domain`, { clientId, domain })
  return data.customDomain
}

export type ClientStatsResponse = {
  totalRequests?: number
  bytesIn?: number
  bytesOut?: number
  bandwidthUsed?: number
  bandwidthLimit?: number
  dailyUsage?: UsagePoint[]
  monthlyUsage?: UsagePoint[]
}

export type UsagePoint = {
  period: string
  bytesIn: number
  bytesOut: number
  totalBytes: number
  totalRequests: number
}

export const fetchClientStats = async (clientId: string): Promise<ClientStatsResponse> => {
  const { data } = await axios.get<ClientStatsResponse>(`${API_BASE_URL}/client/stats`, {
    params: { clientId },
  })
  return data
}

export const updateClientAuth = async (clientId: string, requireAuth: boolean): Promise<AuthResponse> => {
  const { data } = await axios.put<AuthResponse>(`${API_BASE_URL}/client/auth`, { clientId, requireAuth })
  return data
}

export const updateClientRoutes = async (clientId: string, routes: PathRoute[]): Promise<PathRoute[]> => {
  const { data } = await axios.put<{ routes: PathRoute[] }>(`${API_BASE_URL}/client/routes`, { clientId, routes })
  return data.routes
}

export const listTunnels = async (clientId: string): Promise<PersistentTunnel[]> => {
  const { data } = await axios.get<{ tunnels: PersistentTunnel[] }>(`${API_BASE_URL}/client/tunnels`, { params: { clientId } })
  return data.tunnels ?? []
}

export const createTunnel = async (clientId: string, tunnel: NewTunnelInput): Promise<PersistentTunnel> => {
  const { data } = await axios.post<PersistentTunnel>(`${API_BASE_URL}/client/tunnels`, { clientId, ...tunnel })
  return data
}

export const updateTunnel = async (clientId: string, tunnel: PersistentTunnel): Promise<PersistentTunnel> => {
  const { data } = await axios.put<PersistentTunnel>(`${API_BASE_URL}/client/tunnels/${encodeURIComponent(tunnel.id)}`, { clientId, ...tunnel }, { params: { clientId } })
  return data
}

export const setTunnelPaused = async (clientId: string, tunnelId: string, paused: boolean): Promise<PersistentTunnel> => {
  const action = paused ? 'pause' : 'resume'
  const { data } = await axios.post<PersistentTunnel>(`${API_BASE_URL}/client/tunnels/${encodeURIComponent(tunnelId)}/${action}`, { clientId })
  return data
}

export const deleteTunnel = async (clientId: string, tunnelId: string): Promise<void> => {
  await axios.delete(`${API_BASE_URL}/client/tunnels/${encodeURIComponent(tunnelId)}`, { params: { clientId } })
}
