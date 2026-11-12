import axios from 'axios'
import { parsePort } from './utils'

export type FlowStep = 'loading' | 'gate' | 'subdomain' | 'dashboard'

export type Tier = 'anonymous' | 'verified' | 'pro' | 'pro_plus'

export type ClientSession = {
  id: string
  subdomain: string
  port: number | null
  customDomain: string
  /** Host the custom domain's CNAME record points at. */
  dnsTarget: string
  requireAuth: boolean
  plan: string
  bandwidthUsed: number
  bandwidthLimit: number
  ownerEmail: string
  displayName?: string
  avatarUrl?: string
  pathRoutes: PathRoute[]
  /** Addresses (subdomains of ROOT_DOMAIN) this client owns. */
  domains: string[]
}

export type IntegrationProvider = 'slack' | 'discord' | 'teams' | 'google_chat' | 'jira' | 'linear' | 'github'
export type WebhookIntegrationProvider = 'slack' | 'discord' | 'teams' | 'google_chat'

export type IntegrationConfig = {
  baseUrl?: string
  email?: string
  apiToken?: string
  projectKey?: string
  teamId?: string
  hasApiToken?: boolean
  repo?: string
}

/** @deprecated Prefer IntegrationConfig */
export type JiraIntegrationConfig = IntegrationConfig

export type WorkspaceIntegration = {
  provider: IntegrationProvider
  webhookUrl?: string
  events: string[]
  enabled: boolean
  hasWebhook: boolean
  updatedAt?: string
  config?: IntegrationConfig
}

export type IdentityResponse = {
  id: string
  subdomain?: string | null
  port?: number | null
  customDomain?: string | null
  dnsTarget?: string | null
  requireAuth?: boolean
  plan?: string
  bandwidthUsed?: number
  bandwidthLimit?: number
  ownerEmail?: string | null
  pathRoutes?: PathRoute[]
  domains?: string[] | null
  tunnels?: Array<{ subdomain?: string }> | null
}

export type AuthResponse = { requireAuth: boolean; gauthEnabled: boolean }

export type AvailabilityResponse = {
  available?: boolean
  exists?: boolean
  reserved?: boolean
}

export type PortResponse = { port?: number }
export type DomainResponse = { customDomain: string; dnsTarget?: string }
export type PathRoute = { path: string; port: number }

export type TunnelType = 'http' | 'tcp' | 'udp' | 'e2e' | 'mobile'
export type ShareAccess = 'public' | 'private'
export type SharePermissions = 'read' | 'read-write'
export type ShareStatus = 'active' | 'stopped' | 'paused' | 'expired'

export type PersistentTunnel = {
  id: string
  /** The owner's label; empty means show the address. */
  name?: string
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
  /** Web shares only: visitors get the notes toolbar. */
  preview?: boolean
  /** Preview environment inside the project, such as "staging"; empty is main. */
  environment?: string
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
  /** The local port that served it; differs from the share's port on routed paths. */
  port?: number
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
  const subdomain = data.subdomain?.trim().toLowerCase() ?? ''
  // Servers without an address list still own the primary and share subdomains.
  const domains = data.domains ?? [...new Set([subdomain, ...(data.tunnels ?? []).map(t => t.subdomain ?? '')].filter(Boolean))]
  return {
    id: data.id,
    subdomain,
    domains,
    port: parsePort(data.port),
    customDomain: data.customDomain?.trim().toLowerCase() ?? '',
    dnsTarget: data.dnsTarget?.trim().toLowerCase() ?? '',
    requireAuth: data.requireAuth ?? false,
    plan: data.plan ?? 'free',
    bandwidthUsed: data.bandwidthUsed ?? 0,
    bandwidthLimit: data.bandwidthLimit ?? 1073741824,
    ownerEmail: data.ownerEmail?.trim().toLowerCase() ?? '',
    pathRoutes: data.pathRoutes ?? [],
  }
}

/** Account page on the website; `upgrade` opens checkout for that plan. */
export const upgradeUrl = (clientId: string, planId: 'pro' | 'pro_plus'): string =>
  `https://${ROOT_DOMAIN}/account?clientId=${encodeURIComponent(clientId)}&upgrade=${planId}`

/** Website collaboration shell for team review (versions, board, client links). */
export const reviewWorkspaceUrl = (clientId: string, projectId?: string): string => {
  const base = `https://${ROOT_DOMAIN}/app`
  if (!projectId) return `${base}?clientId=${encodeURIComponent(clientId)}`
  return `${base}/projects/${encodeURIComponent(projectId)}?workspace=${encodeURIComponent(clientId)}`
}

/** Website feedback detail for media/timeline review. */
export const reviewFeedbackUrl = (clientId: string, projectId: string, noteId: string): string =>
  `https://${ROOT_DOMAIN}/app/projects/${encodeURIComponent(projectId)}/feedback/${encodeURIComponent(noteId)}?workspace=${encodeURIComponent(clientId)}`

export const tierOf = (session: Pick<ClientSession, 'plan' | 'ownerEmail'>): Tier => {
  if (session.plan === 'pro_plus') return 'pro_plus'
  if (session.plan === 'pro') return 'pro'
  if (session.ownerEmail) return 'verified'
  return 'anonymous'
}

export const TIER_LABELS: Record<Tier, string> = {
  anonymous: 'Guest', verified: 'Free', pro: 'Pro', pro_plus: 'Pro+',
}

/** Mirrors the server's per-plan share limit; the server still enforces it. */
export const SHARE_LIMITS: Record<Tier, number> = {
  anonymous: 3, verified: 5, pro: 25, pro_plus: 100,
}

export type LinkStatus = {
  linked: boolean
  email: string
  plan: string
  tier: Tier
  bandwidthUsed: number
  bandwidthLimit: number
  /** Set when the Google account already had an identity; this install should use it. */
  switchTo?: string
}

const toBase64Url = (value: string): string =>
  btoa(value).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

/** Starts a sign-in; the code is shown here and on the browser's confirm page. */
export const startGoogleLink = async (clientId: string): Promise<{ link: string; code: string }> => {
  const { data } = await axios.post<{ link: string; code: string }>(`${API_BASE_URL}/client/link-start`, { clientId })
  return data
}

/** Browser URL that starts Google sign-in and lands on link-finish for clientId. */
export const googleLinkLoginUrl = (clientId: string, link?: string): string => {
  let finish = `${API_BASE_URL}/client/link-finish?clientId=${encodeURIComponent(clientId)}`
  if (link) finish += `&link=${encodeURIComponent(link)}`
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

export const addDomain = async (clientId: string, name: string): Promise<string[]> => {
  const { data } = await axios.post<{ domains: string[] | null }>(`${API_BASE_URL}/client/domains`, { clientId, name })
  return data.domains ?? []
}

export const removeDomain = async (clientId: string, name: string): Promise<string[]> => {
  const { data } = await axios.delete<{ domains: string[] | null }>(`${API_BASE_URL}/client/domains/${encodeURIComponent(name)}`, { params: { clientId } })
  return data.domains ?? []
}

export const updateExposedPort = async (clientId: string, port: number): Promise<number> => {
  const { data } = await axios.put<PortResponse>(`${API_BASE_URL}/client/port`, { clientId, port })
  return parsePort(data.port) ?? port
}

export const updateCustomDomain = async (clientId: string, domain: string): Promise<{ customDomain: string; dnsTarget: string }> => {
  const { data } = await axios.put<DomainResponse>(`${API_BASE_URL}/client/domain`, { clientId, domain })
  return { customDomain: data.customDomain, dnsTarget: data.dnsTarget ?? '' }
}

/** Whether the custom domain's DNS record already points at its target. */
export const checkCustomDomain = async (clientId: string): Promise<{ ready: boolean; dnsTarget: string }> => {
  const { data } = await axios.get<{ ready?: boolean; dnsTarget?: string }>(`${API_BASE_URL}/client/domain/check`, { params: { clientId } })
  return { ready: Boolean(data.ready), dnsTarget: data.dnsTarget ?? '' }
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

export const listTunnels = async (clientId: string): Promise<PersistentTunnel[]> => {
  const { data } = await axios.get<{ tunnels: PersistentTunnel[] }>(`${API_BASE_URL}/client/tunnels`, { params: { clientId } })
  return data.tunnels ?? []
}

export const createTunnel = async (clientId: string, tunnel: NewTunnelInput & { projectId?: string }): Promise<PersistentTunnel> => {
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

/** Restarts the share's expiry from now; an empty duration removes it. */
export const setShareExpiry = async (clientId: string, tunnel: PersistentTunnel, duration: string): Promise<PersistentTunnel> => {
  const { data } = await axios.put<PersistentTunnel>(`${API_BASE_URL}/client/tunnels/${encodeURIComponent(tunnel.id)}`, { clientId, ...tunnel, duration }, { params: { clientId } })
  return data
}

export type AccessLink = {
  id: string
  token: string
  tunnelId: string
  label: string
  expiresAt?: string
  maxUses: number
  uses: number
  createdAt: string
  lastUsedAt?: string
  /** People allowed to use the link (addresses or @domain), confirmed by an emailed code. */
  emails?: string[]
}

const linksUrl = (tunnelId: string) => `${API_BASE_URL}/client/tunnels/${encodeURIComponent(tunnelId)}/links`

export const listAccessLinks = async (clientId: string, tunnelId: string): Promise<AccessLink[]> => {
  const { data } = await axios.get<{ links: AccessLink[] | null }>(linksUrl(tunnelId), { params: { clientId } })
  return data.links ?? []
}

export const createAccessLink = async (
  clientId: string, tunnelId: string, input: { label: string; expiresIn: string; maxUses: number; emails?: string[] },
): Promise<{ link: AccessLink; links: AccessLink[] }> => {
  const { data } = await axios.post<{ link: AccessLink; links: AccessLink[] | null }>(linksUrl(tunnelId), { clientId, ...input }, { params: { clientId } })
  return { link: data.link, links: data.links ?? [] }
}

export const revokeAccessLink = async (clientId: string, tunnelId: string, linkId: string): Promise<void> => {
  await axios.delete(`${linksUrl(tunnelId)}/${encodeURIComponent(linkId)}`, { params: { clientId } })
}

export const deleteTunnel = async (clientId: string, tunnelId: string): Promise<void> => {
  await axios.delete(`${API_BASE_URL}/client/tunnels/${encodeURIComponent(tunnelId)}`, { params: { clientId } })
}

export type NoteStatus = 'open' | 'in_progress' | 'resolved'

export type ReplyKind = 'comment' | 'started' | 'stopped' | 'resolved' | 'reopened' | 'verified'

export type PreviewReply = {
  id: string
  noteId: string
  author: string
  authorKey?: string
  authorRole?: 'owner' | 'visitor'
  kind: ReplyKind
  body: string
  revisionId?: string
  createdAt: string
}

/** A point (x, y) on the page sits at ((x - originX) * scale, (y - originY) * scale) in the image. */
export type PreviewSnapshot = {
  id: string
  revisionId?: string
  noteId?: string
  kind: 'note' | 'page'
  path: string
  width: number
  height: number
  viewportW: number
  originX: number
  originY: number
  scale: number
  bytes: number
  createdAt: string
}

export type NoteDevice = {
  browser?: string
  os?: string
  mobile: boolean
  viewportW?: number
  viewportH?: number
  pixelRatio?: number
  userAgent?: string
}

export type PreviewNote = {
  id: string
  tunnelId: string
  path: string
  body: string
  author: string
  authorKey?: string
  authorRole?: 'owner' | 'visitor'
  status: NoteStatus
  createdAt: string
  pageX?: number
  pageY?: number
  viewportW?: number
  target?: string
  revisionId?: string
  resolvedRevisionId?: string
  resolvedAt?: string
  verifiedAt?: string
  reopenCount?: number
  snapshot?: PreviewSnapshot
  replies?: PreviewReply[]
  device?: NoteDevice
  issueUrl?: string
  /** "capture" from the extension; "preview" from pinned notes. */
  source?: 'capture' | 'preview' | string
  title?: string
  category?: string
  anchorType?: string
  assigneeEmail?: string
}

export type RevisionLink = { url: string; label: string; kind: 'pull' | 'commit' | 'issue' | 'link' }

export type PreviewApproval = {
  id: string
  revisionId: string
  author: string
  authorKey?: string
  decision: 'approved' | 'changes'
  comment: string
  createdAt: string
}

export type PreviewRevision = {
  id: string
  tunnelId: string
  number: number
  label: string
  summary: string
  createdAt: string
  snapshots: PreviewSnapshot[]
  fixed: number
  links: RevisionLink[]
  approvals: PreviewApproval[]
}

/** A one-time query string that opens the share with owner controls. */
export const createReviewLink = async (clientId: string, tunnelId: string): Promise<string> => {
  const { data } = await axios.post<{ query: string }>(`${API_BASE_URL}/client/tunnels/${encodeURIComponent(tunnelId)}/review-link`, { clientId }, { params: { clientId } })
  return data.query
}

export const listPreviewNotes = async (clientId: string, tunnelId?: string): Promise<PreviewNote[]> => {
  const { data } = await axios.get<{ notes: PreviewNote[] | null }>(`${API_BASE_URL}/client/feedback`, { params: { clientId, tunnelId } })
  return data.notes ?? []
}

const feedbackTimeout = { timeout: 20_000 }

export type FeedbackAttachment = {
  id: string
  kind?: string
  mimeType?: string
  url?: string
  fileName?: string
  durationMs?: number
}

export type FeedbackTimelineEvent = {
  id?: string
  type?: string
  tMs?: number
  payload?: Record<string, unknown>
}

export type FeedbackDetail = {
  attachments: FeedbackAttachment[]
  timeline: FeedbackTimelineEvent[]
  recording?: { url?: string; attachmentId?: string; durationMs?: number } | null
  steps: string[]
  sourceUrl?: string
  title?: string
  summary?: string
}

export const getFeedbackDetail = async (clientId: string, noteId: string): Promise<FeedbackDetail> => {
  const { data } = await axios.get<FeedbackDetail>(
    `${API_BASE_URL}/client/feedback/${encodeURIComponent(noteId)}`,
    { params: { clientId }, ...feedbackTimeout },
  )
  return {
    attachments: data.attachments ?? [],
    timeline: data.timeline ?? [],
    recording: data.recording ?? null,
    steps: data.steps ?? [],
    sourceUrl: data.sourceUrl,
    title: data.title,
    summary: data.summary,
  }
}

const attachmentUrls = new Map<string, Promise<string>>()

/** Object URL for Capture media; authenticated like snapshots. */
export const attachmentObjectUrl = (clientId: string, attachmentId: string): Promise<string> => {
  let pending = attachmentUrls.get(attachmentId)
  if (!pending) {
    pending = axios.get<Blob>(
      `${API_BASE_URL}/client/attachments/${encodeURIComponent(attachmentId)}`,
      { params: { clientId }, responseType: 'blob' },
    ).then(({ data }) => URL.createObjectURL(data))
    pending.catch(() => attachmentUrls.delete(attachmentId))
    attachmentUrls.set(attachmentId, pending)
  }
  return pending
}

/** Guest Capture invite token bound to one share (paste into the extension). */
export const createCaptureInvite = async (
  clientId: string,
  tunnelId: string,
  options: { days?: 1 | 7 | 14 } = {},
): Promise<{ token: string; expiresAt: string; days: number; url?: string }> => {
  const days = options.days ?? 14
  const { data } = await axios.post<{ token: string; expiresAt: string; days?: number; url?: string }>(
    `${API_BASE_URL}/client/tunnels/${encodeURIComponent(tunnelId)}/capture-invite`,
    { clientId, days },
    { params: { clientId, days }, ...feedbackTimeout },
  )
  return { token: data.token, expiresAt: data.expiresAt, days: data.days ?? days, url: data.url }
}

export type CaptureInvite = {
  id: string
  tokenHint: string
  label: string
  expiresAt: string
  revoked: boolean
  status: 'active' | 'expired' | 'revoked' | string
  createdAt: string
  lastUsedAt?: string
}

export const listCaptureInvites = async (clientId: string, tunnelId: string): Promise<CaptureInvite[]> => {
  const { data } = await axios.get<{ invites: CaptureInvite[] | null }>(
    `${API_BASE_URL}/client/tunnels/${encodeURIComponent(tunnelId)}/capture-invites`,
    { params: { clientId }, ...feedbackTimeout },
  )
  return data.invites ?? []
}

export const revokeCaptureInvite = async (clientId: string, tunnelId: string, token: string): Promise<void> => {
  await axios.delete(
    `${API_BASE_URL}/client/tunnels/${encodeURIComponent(tunnelId)}/capture-invites/${encodeURIComponent(token)}`,
    { params: { clientId }, ...feedbackTimeout },
  )
}

export type NoteAction = 'start' | 'resolve' | 'reopen'

const ACTION_FOR_STATUS: Record<NoteStatus, NoteAction> = { open: 'reopen', in_progress: 'start', resolved: 'resolve' }

export const setPreviewNoteStatus = async (clientId: string, noteId: string, status: NoteStatus): Promise<PreviewNote | null> =>
  changePreviewNote(clientId, noteId, ACTION_FOR_STATUS[status])

/** Starts, resolves or reopens a note; resolving can name the revision that fixed it. */
export const changePreviewNote = async (
  clientId: string, noteId: string, action: NoteAction, options: { revisionId?: string; comment?: string; author?: string } = {},
): Promise<PreviewNote | null> => {
  const { data } = await axios.put<{ note?: PreviewNote }>(
    `${API_BASE_URL}/client/feedback/${encodeURIComponent(noteId)}`,
    { clientId, action, ...options },
    { params: { clientId }, ...feedbackTimeout },
  )
  return data.note ?? null
}

export const deletePreviewNote = async (clientId: string, noteId: string): Promise<void> => {
  await axios.delete(`${API_BASE_URL}/client/feedback/${encodeURIComponent(noteId)}`, { params: { clientId }, ...feedbackTimeout })
}

export const replyToNote = async (clientId: string, noteId: string, body: string, author?: string): Promise<PreviewReply> => {
  const { data } = await axios.post<{ reply: PreviewReply }>(
    `${API_BASE_URL}/client/feedback/${encodeURIComponent(noteId)}/replies`,
    { clientId, body, author },
    { params: { clientId }, ...feedbackTimeout },
  )
  return data.reply
}

export const deleteReply = async (clientId: string, noteId: string, replyId: string): Promise<void> => {
  await axios.delete(`${API_BASE_URL}/client/feedback/${encodeURIComponent(noteId)}/replies/${encodeURIComponent(replyId)}`, { params: { clientId } })
}

/** Links a note to an issue; an empty url removes the link. */
export const setNoteIssue = async (clientId: string, noteId: string, url: string): Promise<PreviewNote> => {
  const { data } = await axios.put<{ note: PreviewNote }>(`${API_BASE_URL}/client/feedback/${encodeURIComponent(noteId)}/issue`, { clientId, url }, { params: { clientId } })
  return data.note
}

export const setNoteAssignee = async (clientId: string, noteId: string, email: string): Promise<PreviewNote> => {
  const { data } = await axios.put<{ note: PreviewNote }>(
    `${API_BASE_URL}/client/feedback/${encodeURIComponent(noteId)}/assignee`,
    { clientId, email },
    { params: { clientId } },
  )
  return data.note
}

export const listWorkspaceMembers = async (clientId: string): Promise<string[]> => {
  const { data } = await axios.get<{ members?: Array<{ email?: string; status?: string }> }>(
    `${API_BASE_URL}/api/v1/workspaces/${encodeURIComponent(clientId)}/members`,
    { params: { clientId }, headers: { 'X-Kexoz-Client-ID': clientId } },
  )
  return [...new Set((data.members ?? []).filter(item => item.email && item.status !== 'pending').map(item => String(item.email).toLowerCase()))]
}

export const createWorkspaceGithubIssue = async (clientId: string, noteId: string): Promise<string> => {
  const { data } = await axios.post<{ issueUrl: string }>(
    `${API_BASE_URL}/client/feedback/${encodeURIComponent(noteId)}/github-issue`,
    { clientId },
    { params: { clientId } },
  )
  if (!data.issueUrl) throw new Error('GitHub did not return an issue URL.')
  return data.issueUrl
}

export type CaptureInstall = { storeUrl: string; storeReady: boolean }

export const captureInstall = async (): Promise<CaptureInstall> => {
  const { data } = await axios.get<CaptureInstall>(`${API_BASE_URL}/api/v1/capture/install`)
  return { storeUrl: data.storeUrl || '', storeReady: Boolean(data.storeReady && data.storeUrl) }
}

export const listIntegrations = async (clientId: string): Promise<WorkspaceIntegration[]> => {
  const { data } = await axios.get<{ integrations: WorkspaceIntegration[] }>(`${API_BASE_URL}/client/integrations`, { params: { clientId } })
  return data.integrations ?? []
}

export const saveIntegration = async (
  clientId: string,
  provider: IntegrationProvider,
  input: { webhookUrl?: string; events?: string[]; enabled?: boolean; config?: IntegrationConfig },
): Promise<WorkspaceIntegration> => {
  const { data } = await axios.put<WorkspaceIntegration>(
    `${API_BASE_URL}/client/integrations/${provider}`,
    { clientId, ...input },
    { params: { clientId } },
  )
  return data
}

export const deleteIntegration = async (clientId: string, provider: IntegrationProvider): Promise<void> => {
  await axios.delete(`${API_BASE_URL}/client/integrations/${provider}`, { params: { clientId } })
}

export const testIntegration = async (clientId: string, provider: IntegrationProvider): Promise<void> => {
  await axios.post(`${API_BASE_URL}/client/integrations/${provider}/test`, { clientId }, { params: { clientId } })
}

export const updateClientProfile = async (
  clientId: string,
  input: { displayName: string; avatarUrl?: string },
): Promise<{ displayName: string; avatarUrl?: string; email?: string }> => {
  const { data } = await axios.put<{ displayName: string; avatarUrl?: string; email?: string }>(
    `${API_BASE_URL}/client/profile`,
    { clientId, ...input },
    { params: { clientId } },
  )
  return data
}

export const fetchClientProfile = async (clientId: string): Promise<{
  displayName?: string
  avatarUrl?: string
  email?: string
  linked?: boolean
}> => {
  const { data } = await axios.get(`${API_BASE_URL}/client/profile`, { params: { clientId } })
  return data
}

/** Public share URL for a feedback thread (anyone with the link can read it). */
export const createFeedbackShareLink = async (clientId: string, noteId: string): Promise<{ url: string; token: string }> => {
  const { data } = await axios.post<{ url: string; token: string }>(
    `${API_BASE_URL}/client/feedback/${encodeURIComponent(noteId)}/share`,
    { clientId },
    { params: { clientId }, ...feedbackTimeout },
  )
  return { url: data.url, token: data.token }
}

export const revokeFeedbackShareLink = async (clientId: string, noteId: string): Promise<void> => {
  await axios.delete(`${API_BASE_URL}/client/feedback/${encodeURIComponent(noteId)}/share`, { params: { clientId }, ...feedbackTimeout })
}

const revisionsUrl = (tunnelId: string) => `${API_BASE_URL}/client/tunnels/${encodeURIComponent(tunnelId)}/revisions`

const withRevisionDefaults = (revision: PreviewRevision): PreviewRevision => ({
  ...revision,
  snapshots: revision.snapshots ?? [],
  links: revision.links ?? [],
  approvals: revision.approvals ?? [],
})

export const listRevisions = async (clientId: string, tunnelId: string): Promise<PreviewRevision[]> => {
  const { data } = await axios.get<{ revisions: PreviewRevision[] | null }>(revisionsUrl(tunnelId), { params: { clientId } })
  return (data.revisions ?? []).map(withRevisionDefaults)
}

export const createRevision = async (
  clientId: string, tunnelId: string, input: { label: string; summary: string; fixes: string[]; links: string[]; author?: string },
): Promise<PreviewRevision> => {
  const { data } = await axios.post<{ revision: PreviewRevision }>(revisionsUrl(tunnelId), { clientId, ...input }, { params: { clientId } })
  return withRevisionDefaults(data.revision)
}

export const updateRevision = async (
  clientId: string, tunnelId: string, revisionId: string, input: { label?: string; summary?: string; links?: string[] },
): Promise<PreviewRevision> => {
  const { data } = await axios.put<{ revision: PreviewRevision }>(`${revisionsUrl(tunnelId)}/${encodeURIComponent(revisionId)}`, { clientId, ...input }, { params: { clientId } })
  return withRevisionDefaults(data.revision)
}

export const deleteRevision = async (clientId: string, tunnelId: string, revisionId: string): Promise<void> => {
  await axios.delete(`${revisionsUrl(tunnelId)}/${encodeURIComponent(revisionId)}`, { params: { clientId } })
}

export const uploadRevisionSnapshot = async (
  clientId: string, tunnelId: string, revisionId: string, image: Uint8Array, meta: { path: string; viewportW: number; scale: number },
): Promise<PreviewSnapshot> => {
  const { data } = await axios.post<{ snapshot: PreviewSnapshot }>(
    `${revisionsUrl(tunnelId)}/${encodeURIComponent(revisionId)}/snapshots`,
    new Blob([image as BlobPart], { type: 'image/jpeg' }),
    { params: { clientId, path: meta.path, viewportW: meta.viewportW, scale: meta.scale }, headers: { 'Content-Type': 'image/jpeg' } },
  )
  return data.snapshot
}

const snapshotUrls = new Map<string, Promise<string>>()

/** An object URL for a stored screenshot; screenshots never change, so each is fetched once. */
export const snapshotObjectUrl = (clientId: string, snapshotId: string): Promise<string> => {
  let pending = snapshotUrls.get(snapshotId)
  if (!pending) {
    pending = axios.get<Blob>(`${API_BASE_URL}/client/snapshots/${encodeURIComponent(snapshotId)}`, { params: { clientId }, responseType: 'blob' })
      .then(({ data }) => URL.createObjectURL(data))
    pending.catch(() => snapshotUrls.delete(snapshotId))
    snapshotUrls.set(snapshotId, pending)
  }
  return pending
}

export type Project = { id: string; name: string; tunnelIds: string[]; createdAt?: string }

export const listProjects = async (clientId: string): Promise<Project[]> => {
  const { data } = await axios.get<{ projects: Project[] | null }>(`${API_BASE_URL}/client/projects`, { params: { clientId } })
  return data.projects ?? []
}

type ProjectsResponse = { projects: Project[] | null }

export const createProject = async (clientId: string, name: string, tunnelIds: string[]): Promise<{ projects: Project[]; projectId: string }> => {
  const { data } = await axios.post<ProjectsResponse & { projectId?: string }>(`${API_BASE_URL}/client/projects`, { clientId, name, tunnelIds }, { params: { clientId } })
  const projects = data.projects ?? []
  // Older servers don't return the id, so find the new project by name.
  const projectId = data.projectId ?? projects.find(project => project.name.toLowerCase() === name.toLowerCase())?.id ?? ''
  return { projects, projectId }
}

/** Moves a share into a project, or out of every project when projectId is empty. */
export const setTunnelProject = async (clientId: string, tunnelId: string, projectId: string): Promise<Project[]> => {
  const { data } = await axios.put<ProjectsResponse>(`${API_BASE_URL}/client/tunnels/${encodeURIComponent(tunnelId)}/project`, { clientId, projectId }, { params: { clientId } })
  return data.projects ?? []
}

export const updateProject = async (clientId: string, id: string, name: string, tunnelIds: string[]): Promise<Project[]> => {
  const { data } = await axios.put<ProjectsResponse>(`${API_BASE_URL}/client/projects/${encodeURIComponent(id)}`, { clientId, name, tunnelIds }, { params: { clientId } })
  return data.projects ?? []
}

export const deleteProject = async (clientId: string, id: string): Promise<Project[]> => {
  const { data } = await axios.delete<ProjectsResponse>(`${API_BASE_URL}/client/projects/${encodeURIComponent(id)}`, { params: { clientId } })
  return data.projects ?? []
}

/** Copies every share of environment `from` ("" is main) into a new environment. */
export const createEnvironment = async (
  clientId: string, projectId: string, name: string, from: string,
): Promise<{ tunnels: PersistentTunnel[]; projects: Project[] }> => {
  const { data } = await axios.post<{ tunnels: PersistentTunnel[] | null; projects: Project[] | null }>(
    `${API_BASE_URL}/client/projects/${encodeURIComponent(projectId)}/environments`, { clientId, name, from }, { params: { clientId } },
  )
  return { tunnels: data.tunnels ?? [], projects: data.projects ?? [] }
}

export type InboxDelivery = 'captured' | 'forwarded' | 'replayed' | 'failed'

export type Inbox = {
  id: string
  projectId: string
  token: string
  targetTunnelId: string
  forward: boolean
  replyStatus: number
  createdAt: string
}

export type InboxRequest = {
  id: string
  method: string
  path: string
  headers: Record<string, string[]>
  contentType: string
  bodySize: number
  bodyPreview: string
  /** Only on the detail endpoint. */
  bodyBase64?: string
  remoteIp: string
  receivedAt: string
  delivery: InboxDelivery
  targetTunnelId?: string
  responseStatus?: number
  responseMs?: number
  responseError?: string
  responseBody?: string
  deliveredAt?: string
  replayCount: number
}

export type InboxView = {
  inbox: Inbox | null
  url: string
  limit: number
  retentionDays: number
  requests: InboxRequest[]
  targetLive: boolean
}

const inboxUrl = (projectId: string) => `${API_BASE_URL}/client/projects/${encodeURIComponent(projectId)}/inbox`
const inboxRequestUrl = (requestId: string) => `${API_BASE_URL}/client/inbox/requests/${encodeURIComponent(requestId)}`

const withInboxDefaults = (data: Partial<InboxView>): InboxView => ({
  inbox: data.inbox ?? null,
  url: data.url ?? '',
  limit: data.limit ?? 0,
  retentionDays: data.retentionDays ?? 0,
  requests: data.requests ?? [],
  targetLive: data.targetLive ?? false,
})

export const fetchInbox = async (clientId: string, projectId: string): Promise<InboxView> => {
  const { data } = await axios.get<Partial<InboxView>>(inboxUrl(projectId), { params: { clientId } })
  return withInboxDefaults(data)
}

export const createInbox = async (clientId: string, projectId: string): Promise<InboxView> => {
  const { data } = await axios.post<Partial<InboxView>>(inboxUrl(projectId), { clientId }, { params: { clientId } })
  return withInboxDefaults(data)
}

export const updateInbox = async (
  clientId: string, projectId: string, input: { targetTunnelId?: string; forward?: boolean; replyStatus?: number; rotateUrl?: boolean },
): Promise<InboxView> => {
  const { data } = await axios.put<Partial<InboxView>>(inboxUrl(projectId), { clientId, ...input }, { params: { clientId } })
  return withInboxDefaults(data)
}

export const clearInbox = async (clientId: string, projectId: string): Promise<void> => {
  await axios.delete(`${inboxUrl(projectId)}/requests`, { params: { clientId } })
}

export const fetchInboxRequest = async (clientId: string, requestId: string): Promise<InboxRequest> => {
  const { data } = await axios.get<{ request: InboxRequest }>(inboxRequestUrl(requestId), { params: { clientId } })
  return data.request
}

export const deleteInboxRequest = async (clientId: string, requestId: string): Promise<void> => {
  await axios.delete(inboxRequestUrl(requestId), { params: { clientId } })
}

/** Sends a stored request through a running share (the inbox's target unless tunnelId is given). */
export const replayInboxRequest = async (clientId: string, requestId: string, tunnelId?: string): Promise<InboxRequest> => {
  const { data } = await axios.post<{ request: InboxRequest }>(`${inboxRequestUrl(requestId)}/replay`, { clientId, tunnelId }, { params: { clientId } })
  return data.request
}

/** Stores the outcome of a replay this app sent straight to a local port. */
export const recordInboxResult = async (
  clientId: string, requestId: string, result: { status?: number; ms: number; error?: string; body?: string },
): Promise<InboxRequest> => {
  const { data } = await axios.post<{ request: InboxRequest }>(`${inboxRequestUrl(requestId)}/result`, { clientId, ...result }, { params: { clientId } })
  return data.request
}

export type AnalyticsRange = '24h' | '7d' | '30d' | '90d'

export type ShareAnalytics = {
  range: AnalyticsRange
  bucket: 'hour' | 'day'
  maxDays: number
  live: boolean
  /** 0–100, share of the range the share was connected. */
  onlinePct: number
  totals: {
    requests: number; bytesIn: number; bytesOut: number
    s2xx: number; s3xx: number; s4xx: number; s5xx: number
    avgMs: number; p50Ms: number; p95Ms: number; maxMs: number
  }
  series: { t: string; requests: number; bytes: number; errors: number; avgMs: number }[]
  paths: { path: string; requests: number; errors: number; avgMs: number }[]
  connections: { connectedAt: string; disconnectedAt?: string }[]
}

export const fetchShareAnalytics = async (clientId: string, tunnelId: string, range: AnalyticsRange): Promise<ShareAnalytics> => {
  const { data } = await axios.get<ShareAnalytics>(`${API_BASE_URL}/client/tunnels/${encodeURIComponent(tunnelId)}/analytics`, { params: { clientId, range } })
  return { ...data, series: data.series ?? [], paths: data.paths ?? [], connections: data.connections ?? [] }
}

export type AccessSession = {
  id: string
  tunnelId: string
  linkId?: string
  linkLabel?: string
  via: 'password' | 'link' | 'email'
  email?: string
  /** Masked by the server. */
  ip: string
  device: string
  createdAt: string
  lastSeenAt: string
  requests: number
}

const sessionsUrl = (tunnelId: string) => `${API_BASE_URL}/client/tunnels/${encodeURIComponent(tunnelId)}/sessions`

export const listAccessSessions = async (clientId: string, tunnelId: string): Promise<AccessSession[]> => {
  const { data } = await axios.get<{ sessions: AccessSession[] | null }>(sessionsUrl(tunnelId), { params: { clientId } })
  return data.sessions ?? []
}

export const revokeAccessSession = async (clientId: string, tunnelId: string, sessionId: string): Promise<AccessSession[]> => {
  const { data } = await axios.delete<{ sessions: AccessSession[] | null }>(`${sessionsUrl(tunnelId)}/${encodeURIComponent(sessionId)}`, { params: { clientId } })
  return data.sessions ?? []
}

export const signEveryoneOut = async (clientId: string, tunnelId: string): Promise<number> => {
  const { data } = await axios.post<{ signedOut?: number }>(`${sessionsUrl(tunnelId)}/revoke-all`, { clientId }, { params: { clientId } })
  return data.signedOut ?? 0
}

/** Roles accepted by POST /client/team/invites (server normalizes aliases). */
export type TeamInviteRole = 'admin' | 'developer' | 'editor' | 'reviewer' | 'viewer'

export type TeamRole = 'admin' | 'developer' | 'editor' | 'reviewer' | 'viewer' | string

export type TeamMember = {
  id: string
  email: string
  role: TeamInviteRole | string
  status: 'pending' | 'active' | string
  memberClientId?: string
  inviteToken?: string
  createdAt: string
  acceptedAt?: string
}

const norm = (role: string) => role.trim().toLowerCase()

/** Desktop UI label for a stored team role. */
export const teamRoleLabel = (role: string): string => {
  switch (norm(role)) {
    case 'admin': return 'Admin'
    case 'developer':
    case 'editor': return 'Developer'
    case 'reviewer': return 'Reviewer'
    case 'viewer': return 'Viewer'
    default:
      return role ? role.charAt(0).toUpperCase() + role.slice(1) : 'Member'
  }
}

/** Pick an invite payload role when re-sending for an existing member. */
export const teamInviteRoleForMember = (role: string): TeamInviteRole => {
  switch (norm(role)) {
    case 'admin': return 'admin'
    case 'reviewer': return 'reviewer'
    case 'viewer': return 'viewer'
    case 'developer':
    case 'editor':
    default:
      return 'developer'
  }
}

export type SharedWorkspace = {
  ownerClientId: string
  ownerEmail: string
  role: string
  acceptedAt?: string
}

export type CollabVersion = {
  id: string
  projectId: string
  number: number
  name: string
  status: string
  previewTunnelId?: string
}

/** Creates a project version (or reuses latest) and optionally binds a live preview tunnel. */
export const createCollabVersion = async (
  clientId: string,
  projectId: string,
  input: { name?: string; reuseLatest?: boolean; previewTunnelId?: string; gitCommit?: string } = {},
): Promise<{ version: CollabVersion; reused: boolean }> => {
  const { data } = await axios.post<{ version: CollabVersion; reused: boolean }>(
    `${API_BASE_URL}/api/v1/workspaces/${encodeURIComponent(clientId)}/projects/${encodeURIComponent(projectId)}/versions`,
    input,
    { params: { clientId }, headers: { 'X-Kexoz-Client-ID': clientId }, timeout: 20_000 },
  )
  return { version: data.version, reused: Boolean(data.reused) }
}

export const bindCollabPreview = async (
  clientId: string, projectId: string, versionId: string, tunnelId: string,
): Promise<CollabVersion> => {
  const { data } = await axios.post<{ version: CollabVersion }>(
    `${API_BASE_URL}/api/v1/workspaces/${encodeURIComponent(clientId)}/projects/${encodeURIComponent(projectId)}/versions/${encodeURIComponent(versionId)}/preview`,
    { tunnelId },
    { params: { clientId }, headers: { 'X-Kexoz-Client-ID': clientId }, timeout: 20_000 },
  )
  return data.version
}

export const listTeam = async (clientId: string): Promise<TeamMember[]> => {
  const { data } = await axios.get<{ members: TeamMember[] | null }>(`${API_BASE_URL}/client/team`, { params: { clientId } })
  return data.members ?? []
}

export const inviteTeamMember = async (clientId: string, email: string, role: TeamInviteRole = 'developer'): Promise<{ id: string; email: string; role: string; status: string; inviteUrl: string; token: string }> => {
  const { data } = await axios.post<{ id: string; email: string; role: string; status: string; inviteUrl: string; token: string }>(`${API_BASE_URL}/client/team/invites`, { clientId, email, role }, { params: { clientId } })
  return data
}

export const revokeTeamMember = async (clientId: string, memberId: string): Promise<void> => {
  await axios.delete(`${API_BASE_URL}/client/team/members/${encodeURIComponent(memberId)}`, { params: { clientId } })
}

export const acceptTeamInvite = async (clientId: string, token: string): Promise<{ ok: boolean; ownerClientId: string; role: string }> => {
  const { data } = await axios.post<{ ok: boolean; ownerClientId: string; role: string }>(`${API_BASE_URL}/client/team/accept`, { clientId, token }, { params: { clientId } })
  return data
}

export const listSharedWorkspaces = async (clientId: string): Promise<SharedWorkspace[]> => {
  const { data } = await axios.get<{ workspaces: SharedWorkspace[] | null }>(`${API_BASE_URL}/client/team/shared`, { params: { clientId } })
  return data.workspaces ?? []
}
