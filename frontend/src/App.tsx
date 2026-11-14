import './styles/tokens.css'
import './styles/base.css'
import './styles/animations.css'
import './styles/experience.css'

import { type FormEvent, lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { Toaster, toast } from 'react-hot-toast'
import axios from 'axios'

import {
  type ClientSession, type ConnectionState, type FlowStep, type PersistentTunnel, type PreviewNote, type Project, type ShareAccess,
  API_BASE_URL, ROOT_DOMAIN,
  ensureClientIdentity, checkSubdomainAvailability, claimSubdomain,
  updateExposedPort, updateCustomDomain, fetchClientStats,
  googleLinkLoginUrl, fetchLinkStatus, startGoogleLink,
  listTunnels, createTunnel, updateTunnel, deleteTunnel, setTunnelPaused,
  listPreviewNotes, addDomain, removeDomain, type PathRoute
} from './lib/api'
import { addressHolder, extraRoutes, isGatedType, isSupportedType, routesForShare, shareLabel, shareStatus, shareUrl, type NewShareRequest } from './lib/shares'
import {
  clearMobileBinding, clearMobileSession, readMobileSerial, readMobileSessionId,
  saveMobileBinding,
} from './lib/mobilePreview'
import { useConnectionHistory } from './hooks/useConnectionHistory'
import { clearClientId, getClientId, setClientId } from './lib/storage'
import { normalizeSubdomain, extractError } from './lib/utils'
import { createTunnelConnection } from './lib/tunnel'
import { useTheme } from './hooks/useTheme'
import { useRequestLog } from './hooks/useRequestLog'
import { forgetLegacyNames, loadLegacyNames } from './lib/legacyNames'
import { useProjects } from './hooks/useProjects'
import { useConfirm } from './hooks/useConfirm'
import { useOpenFeedback } from './hooks/useOpenFeedback'

import AppShell from './components/layout/AppShell'
import Sidebar from './components/layout/Sidebar'
import { NAV_ITEMS, type Page } from './lib/navigation'
import LoadingScreen from './components/screens/LoadingScreen'
import GateScreen from './components/screens/GateScreen'
import SubdomainScreen from './components/screens/SubdomainScreen'
import WelcomePanel from './components/dashboard/WelcomePanel'
import type { ShareControls } from './components/shares/ShareList'
import NewShareModal from './components/modals/NewShareModal'

import LoadingBlock from './components/ui/LoadingBlock'

const DashboardPage = lazy(() => import('./components/pages/DashboardPage'))
const ProjectsPage = lazy(() => import('./components/pages/ProjectsPage'))
const RequestsPage = lazy(() => import('./components/pages/RequestsPage'))
const ReviewPage = lazy(() => import('./components/pages/ReviewPage'))
const DomainsPage = lazy(() => import('./components/pages/DomainsPage'))
const SettingsPage = lazy(() => import('./components/pages/SettingsPage'))
const TeamPage = lazy(() => import('./components/pages/TeamPage'))
const AccountPage = lazy(() => import('./components/pages/AccountPage'))

const TOAST_OPTIONS = {
  duration: 3500,
  className: 'ps-toast',
  style: {
    boxShadow: '0 12px 32px rgba(0,0,0,0.35), 0 0 0 1px color-mix(in srgb, var(--accent) 12%, transparent)',
    background: 'var(--bg-elevated)',
    color: 'var(--text)',
    border: '1px solid var(--border-bright)',
    borderRadius: 12,
    padding: '12px 16px',
    maxWidth: 400,
    fontSize: 13,
    fontWeight: 500,
    lineHeight: 1.45,
  },
  success: {
    className: 'ps-toast ps-toast-success',
    iconTheme: { primary: 'var(--green)', secondary: 'var(--bg-elevated)' },
  },
  error: {
    duration: 6000,
    className: 'ps-toast ps-toast-error',
    iconTheme: { primary: 'var(--red)', secondary: 'var(--bg-elevated)' },
  },
  loading: {
    className: 'ps-toast ps-toast-loading',
    iconTheme: { primary: 'var(--accent)', secondary: 'var(--bg-elevated)' },
  },
}

/** Moves share names that older versions kept on this computer to the account. */
async function migrateLegacyNames(clientId: string, tunnels: PersistentTunnel[], names: Record<string, string>) {
  const known = new Set(tunnels.map(tunnel => tunnel.id))
  const settled = Object.keys(names).filter(id => !known.has(id))
  for (const tunnel of tunnels) {
    const name = names[tunnel.id]?.trim().slice(0, 60)
    if (!name) continue
    if (tunnel.name) {
      settled.push(tunnel.id)
      continue
    }
    try {
      const updated = await updateTunnel(clientId, { ...tunnel, name })
      if (updated.name) settled.push(tunnel.id)
    } catch {
      // Tried again on the next launch.
    }
  }
  if (settled.length > 0) forgetLegacyNames(settled)
}

export default function App() {
  const [step, setStep] = useState<FlowStep>('loading')
  const [activePage, setActivePage] = useState<Page>(() => {
    // Return to the page the operator was last on after a restart.
    const saved = window.localStorage.getItem('kexoz-active-page')
    if (saved === 'inbox') return 'projects'
    return (NAV_ITEMS.some(item => item.id === saved) ? saved : 'dashboard') as Page
  })
  const [overviewNotes, setOverviewNotes] = useState<PreviewNote[]>([])
  const [session, setSession] = useState<ClientSession | null>(null)

  useEffect(() => {
    window.localStorage.setItem('kexoz-active-page', activePage)
  }, [activePage])

  const [subdomainInput, setSubdomainInput] = useState('')
  const [portInput, setPortInput] = useState('')
  const [domainInput, setDomainInput] = useState('')

  const [statusMessage, setStatusMessage] = useState('Starting Kexoz…')
  const [loadError, setLoadError] = useState('')
  const [isBusy, setIsBusy] = useState(false)
  const [connState, setConnState] = useState<ConnectionState>('idle')
  const [gauthEnabled, setGauthEnabled] = useState(false)
  const [verifying, setVerifying] = useState(false)
  const [signInCode, setSignInCode] = useState<string | null>(null)
  const [showNewTunnel, setShowNewTunnel] = useState(false)
  const [newShareProject, setNewShareProject] = useState<string | undefined>(undefined)
  /** Opens the new share window with path routing already shown. */
  const [newShareRouted, setNewShareRouted] = useState(false)
  const [newShareEnvironment, setNewShareEnvironment] = useState('')
  const [openProjectId, setOpenProjectId] = useState<string | null>(null)
  const [persistentTunnels, setPersistentTunnels] = useState<PersistentTunnel[]>([])
  const [selectedTunnelId, setSelectedTunnelId] = useState<string | null>(null)
  /** The selected share's routes other than /, as the user is editing them. */
  const [routeRules, setRouteRules] = useState<PathRoute[]>([])
  const routesEdited = useRef(false)
  const [portListening, setPortListening] = useState<boolean | null>(null)
  const [routePortStatus, setRoutePortStatus] = useState<Record<number, boolean | null>>({})
  const [bytesIn, setBytesIn] = useState(0)
  const [bytesOut, setBytesOut] = useState(0)
  const [dailyUsage, setDailyUsage] = useState<import('./lib/api').UsagePoint[]>([])
  useTheme()
  const { requestLog, totalRequests, retention, setRetention, addLogEntry, clearLog } = useRequestLog()
  const projectsApi = useProjects(session?.id)
  const { confirm, dialog: confirmDialog } = useConfirm()
  const { events: connectionEvents, record: recordConnection } = useConnectionHistory()
  const openFeedback = useOpenFeedback(session?.id)
  const [reviewTunnelId, setReviewTunnelId] = useState<string | null>(() => window.localStorage.getItem('kexoz-review-share'))
  const [reviewNoteId, setReviewNoteId] = useState<string | null>(null)

  useEffect(() => {
    if (!session?.id) { setOverviewNotes([]); return }
    let alive = true
    const load = () => {
      listPreviewNotes(session.id).then(notes => { if (alive) setOverviewNotes(notes) }).catch(() => undefined)
    }
    load()
    const id = window.setInterval(load, 60000)
    return () => { alive = false; window.clearInterval(id) }
  }, [session?.id, openFeedback])

  useEffect(() => {
    const unsub = window.kexoz?.onTrayAction?.((action) => {
      if (action === 'new-share') {
        setActivePage('projects')
        setShowNewTunnel(true)
        return
      }
      if (action === 'feedback') { setActivePage('review'); return }
      if (action === 'overview') { setActivePage('dashboard'); return }
      if (action === 'projects') { setActivePage('projects'); return }
      if (action === 'show') { /* window already shown by main */ }
    })
    return () => { unsub?.() }
  }, [])

  useEffect(() => {
    if (reviewTunnelId) window.localStorage.setItem('kexoz-review-share', reviewTunnelId)
  }, [reviewTunnelId])

  // Ctrl/Cmd+number jumps between pages in sidebar order; Ctrl/Cmd+N starts a new share.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || document.querySelector('[aria-modal="true"]')) return
      if (!(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey) return
      const target = event.target as HTMLElement | null
      if (target?.isContentEditable || target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA') return
      const pages: Record<string, Page> = Object.fromEntries(NAV_ITEMS.map(item => [item.shortcut, item.id]))
      if (event.key.toLowerCase() === 'n') {
        event.preventDefault()
        setActivePage('projects')
        setNewShareProject(undefined)
        setNewShareEnvironment('')
        setShowNewTunnel(true)
        return
      }
      const page = pages[event.key]
      if (page) {
        event.preventDefault()
        setActivePage(page)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  // Short blips reconnect on their own, so only speak up if the link stays down.
  const wasConnected = useRef(false)
  const lostToastTimer = useRef<number | null>(null)
  const lostToastShown = useRef(false)
  useEffect(() => {
    const clearTimer = () => {
      if (lostToastTimer.current !== null) window.clearTimeout(lostToastTimer.current)
      lostToastTimer.current = null
    }
    if (connState === 'connected') {
      clearTimer()
      if (lostToastShown.current) toast.success('Back online', { id: 'conn-state', duration: 3000 })
      lostToastShown.current = false
      wasConnected.current = true
    } else if (connState === 'idle') {
      clearTimer()
      if (lostToastShown.current) toast.dismiss('conn-state')
      lostToastShown.current = false
      wasConnected.current = false
    } else if (wasConnected.current && !lostToastShown.current && lostToastTimer.current === null) {
      lostToastTimer.current = window.setTimeout(() => {
        lostToastTimer.current = null
        lostToastShown.current = true
        toast.loading('Connection lost. Reconnecting…', { id: 'conn-state', duration: Infinity })
      }, 5000)
    }
  }, [connState])

  const tunnelPort = useRef<number | null>(null)
  const tunnelClose = useRef<(() => void) | null>(null)
  const tunnelConnections = useRef(new Map<string, { close: () => void; setPort: (port: number) => void; portRef: { current: number | null } }>())
  const connectionStates = useRef(new Map<string, ConnectionState>())
  const verifyAttempt = useRef(0)
  const lastPortListening = useRef<boolean | null>(null)

  /** The status shown to the user is the worst state across every running share. */
  const setShareState = useCallback((key: string, state: ConnectionState | null, reason?: string) => {
    const states = connectionStates.current
    if (state === null) states.delete(key)
    else states.set(key, state)
    if (key !== 'legacy') recordConnection(key, state, reason)
    const all = [...states.values()]
    setConnState(
      all.includes('disconnected') ? 'disconnected'
        : all.includes('connecting') ? 'connecting'
        : all.includes('connected') ? 'connected'
        : 'idle',
    )
  }, [recordConnection])

  const openTunnelConnection = useCallback((clientId: string, tunnelId?: string, port?: number, tunnelType?: string) => {
    const key = tunnelId ?? 'legacy'
    tunnelConnections.current.get(key)?.close()
    const portRef = tunnelId ? { current: port ?? null } : tunnelPort
    const tunnel = createTunnelConnection({
      apiBaseUrl: API_BASE_URL,
      clientId,
      tunnelId,
      tunnelType,
      portRef,
      onStateChange: (state, reason) => setShareState(key, state, reason),
      onLogEntry: addLogEntry,
    })
    tunnelConnections.current.set(key, { close: tunnel.close, setPort: tunnel.setPort, portRef })
    tunnelClose.current = tunnel.close
  }, [addLogEntry, setShareState])

  const closeConnection = useCallback((key: string) => {
    tunnelConnections.current.get(key)?.close()
    tunnelConnections.current.delete(key)
    setShareState(key, null)
  }, [setShareState])

  const connectShare = useCallback((clientId: string, tunnel: PersistentTunnel) => {
    openTunnelConnection(clientId, tunnel.id, tunnel.port, tunnel.tunnelType)
  }, [openTunnelConnection])

  const requestHosts = useMemo(() => {
    const names = [session?.subdomain, ...(session?.domains ?? [])].filter(Boolean).map(name => `${name}.${ROOT_DOMAIN}`)
    const custom = [session?.customDomain, ...persistentTunnels.filter(t => isGatedType(t.tunnelType)).map(t => t.customDomain)]
    return [...new Set([...names, ...custom].filter((host): host is string => Boolean(host)).map(host => host.toLowerCase()))]
  }, [session, persistentTunnels])

  const persistentTunnelsRef = useRef(persistentTunnels)
  persistentTunnelsRef.current = persistentTunnels

  const editRouteRules = useCallback((rules: PathRoute[]) => {
    routesEdited.current = true
    setRouteRules(rules)
  }, [])

  // Route rules change on every keystroke, so save them once typing pauses.
  // Rows that aren't finished yet are left out; the gateway reads the saved
  // routes on every request, so running shares pick them up right away.
  useEffect(() => {
    if (!routesEdited.current || !session?.id || !selectedTunnelId || step !== 'dashboard') return
    const clientId = session.id
    const timer = window.setTimeout(() => {
      const selected = persistentTunnelsRef.current.find(tunnel => tunnel.id === selectedTunnelId)
      if (!selected || selected.tunnelType !== 'http') return
      const pathRoutes = routesForShare(selected.port, routeRules)
      const same = JSON.stringify(pathRoutes) === JSON.stringify(routesForShare(selected.port, extraRoutes(selected)))
      if (same) return
      updateTunnel(clientId, { ...selected, pathRoutes })
        .then(updated => setPersistentTunnels(current => current.map(item => item.id === updated.id ? { ...item, pathRoutes: updated.pathRoutes } : item)))
        .catch(err => toast.error(extractError(err), { id: 'routes' }))
    }, 600)
    return () => window.clearTimeout(timer)
  }, [routeRules, session?.id, selectedTunnelId, step])

  useEffect(() => {
    if (window.kexoz?.updateTray) {
      window.kexoz.updateTray(persistentTunnels)
    }
  }, [persistentTunnels, connState])

  // Start-on-boot is no longer offered, so undo it for anyone who turned it on earlier.
  useEffect(() => {
    if (window.localStorage.getItem('kexoz-autostart') === 'true') {
      void window.kexoz?.setAutoStart?.(false)
    }
    window.localStorage.removeItem('kexoz-autostart')
  }, [])

  // --- Network Checks ---
  const checkListening = useCallback(async (port: number | null) => {
    if (!port) {
      setPortListening(null)
      return
    }
    if (window.kexoz?.checkPort) {
      const listening = await window.kexoz.checkPort(port)
      setPortListening(listening)
      if (lastPortListening.current === true && !listening) {
        void window.kexoz.notify?.({
          title: 'Your app stopped responding',
          body: `localhost:${port} isn't accepting connections, so visitors will see an error.`,
        })
      }
      lastPortListening.current = listening
      return
    }
    setPortListening(null)
  }, [])

  useEffect(() => {
    if (step !== 'dashboard') return
    void checkListening(tunnelPort.current)
    const id = window.setInterval(() => void checkListening(tunnelPort.current), 5000)
    return () => window.clearInterval(id)
  }, [checkListening, step])

  useEffect(() => {
    if (step !== 'dashboard' || !window.kexoz?.checkPort) return
    const refreshRoutePorts = async () => {
      const ports = [...new Set(routeRules.map(rule => rule.port).filter(port => Number.isInteger(port) && port > 0))]
      const results = await Promise.all(ports.map(async port => [port, await window.kexoz!.checkPort(port)] as const))
      setRoutePortStatus(Object.fromEntries(results))
    }
    void refreshRoutePorts()
    const id = window.setInterval(() => void refreshRoutePorts(), 5000)
    return () => window.clearInterval(id)
  }, [routeRules, step])

  useEffect(() => {
    if (!session?.id || step !== 'dashboard') return
    let cancelled = false

    const refreshBandwidth = async () => {
      try {
        const stats = await fetchClientStats(session.id)
        if (cancelled) return
        setSession(cur => {
          if (!cur) return cur
          const used = stats.bandwidthUsed ?? cur.bandwidthUsed
          const limit = stats.bandwidthLimit ?? cur.bandwidthLimit
          if (used === cur.bandwidthUsed && limit === cur.bandwidthLimit) return cur
          return { ...cur, bandwidthUsed: used, bandwidthLimit: limit }
        })
        setBytesIn(stats.bytesIn ?? 0)
        setBytesOut(stats.bytesOut ?? 0)
        setDailyUsage(stats.dailyUsage ?? [])
      } catch {
        // Keep last known values if stats briefly fail.
      }
    }

    void refreshBandwidth()
    const id = window.setInterval(refreshBandwidth, 3000)
    return () => {
      cancelled = true
      window.clearInterval(id)
    }
  }, [session?.id, step])

  const bootstrapClient = useCallback(async (): Promise<void> => {
    setStep('loading')
    setLoadError('')
    setIsBusy(true)
    toast.dismiss()

    try {
      const storedId = getClientId()
      setStatusMessage('Starting Kexoz…')

      const nextSession = await ensureClientIdentity(storedId)
      axios.defaults.headers.common['X-Kexoz-Client-ID'] = nextSession.id
      setClientId(nextSession.id)
      setSession(nextSession)
      const savedTunnels = (await listTunnels(nextSession.id).catch(() => [])).filter(tunnel => isSupportedType(tunnel.tunnelType))
      const selected = savedTunnels.find(tunnel => tunnel.active) ?? savedTunnels[0]
      const legacyNames = loadLegacyNames()
      setPersistentTunnels(savedTunnels.map(tunnel => tunnel.name || !legacyNames[tunnel.id] ? tunnel : { ...tunnel, name: legacyNames[tunnel.id] }))
      if (Object.keys(legacyNames).length > 0) void migrateLegacyNames(nextSession.id, savedTunnels, legacyNames)
      setSelectedTunnelId(selected?.id ?? null)
      const selectedPort = selected?.port ?? nextSession.port
      setPortInput(selectedPort ? String(selectedPort) : '')
      setSubdomainInput(selected?.subdomain ?? nextSession.subdomain)
      setDomainInput(selected?.customDomain ?? nextSession.customDomain)
      routesEdited.current = false
      setRouteRules(selected ? extraRoutes(selected) : [])
      tunnelPort.current = selectedPort
      void checkListening(selectedPort)

      for (const tunnel of savedTunnels.filter(tunnel => tunnel.active)) connectShare(nextSession.id, tunnel)

      // Best-effort: needed by the verify gate and the auth-wall toggle.
      try {
        const { data: authStatus } = await axios.get<{ enabled: boolean }>(`${API_BASE_URL}/auth/google/status`)
        setGauthEnabled(authStatus.enabled)
      } catch {
        setGauthEnabled(false)
      }

      if (nextSession.subdomain.length > 0) {
        setStep('dashboard')
      } else if (!nextSession.ownerEmail) {
        // Brand-new identity: offer Google verification before subdomain setup.
        setStep('gate')
      } else {
        setStep('subdomain')
      }
    } catch (error) {
      console.error('Kexoz failed to start', error)
      setLoadError('Can’t reach Kexoz')
    } finally {
      setIsBusy(false)
    }
  }, [checkListening, connectShare])

  useEffect(() => {
    void bootstrapClient()
    const connections = tunnelConnections.current
    return () => {
      verifyAttempt.current += 1
      connections.forEach(connection => connection.close())
      connections.clear()
      tunnelClose.current?.()
      tunnelClose.current = null
    }
  }, [bootstrapClient])

  /** Opens Google sign-in in the browser, then polls until the link lands. */
  const startGoogleVerify = useCallback(async (): Promise<void> => {
    if (!session || verifying) return
    if (!gauthEnabled) {
      toast.error('Google sign-in isn’t available right now.')
      return
    }
    const attempt = ++verifyAttempt.current
    setVerifying(true)
    toast.dismiss()
    let loginUrl = googleLinkLoginUrl(session.id)
    let code = ''
    try {
      const started = await startGoogleLink(session.id)
      loginUrl = googleLinkLoginUrl(session.id, started.link)
      code = started.code
    } catch {
      // Servers without link-start still accept the plain link.
    }
    if (verifyAttempt.current !== attempt) return
    setSignInCode(code || null)
    toast.loading(code ? `Finish signing in with Google in your browser. Your code is ${code}.` : 'Finish signing in with Google in your browser', { id: 'google-signin', duration: Infinity })
    window.open(loginUrl, '_blank', 'noopener')
    const deadline = Date.now() + 5 * 60 * 1000
    try {
      for (;;) {
        await new Promise(r => setTimeout(r, 2000))
        if (verifyAttempt.current !== attempt) return
        if (Date.now() > deadline) {
          toast.error('Sign-in timed out. Try again.', { id: 'google-signin', duration: 6000 })
          return
        }
        try {
          const status = await fetchLinkStatus(session.id)
          if (verifyAttempt.current !== attempt) return
          if (status.switchTo) {
            tunnelConnections.current.forEach(connection => connection.close())
            tunnelConnections.current.clear()
            setClientId(status.switchTo)
            void bootstrapClient()
            // Explicit duration: replacing a loading toast with Infinity otherwise sticks forever.
            toast.success(`Signed in as ${status.email}.`, { id: 'google-signin', duration: 3500 })
            return
          }
          if (status.linked) {
            const fresh = await ensureClientIdentity(session.id)
            if (verifyAttempt.current !== attempt) return
            setClientId(fresh.id)
            setSession(fresh)
            setPortInput(fresh.port ? String(fresh.port) : '')
            setSubdomainInput(fresh.subdomain)
            setDomainInput(fresh.customDomain)
            toast.success('Signed in. You now have the full free plan.', { id: 'google-signin', duration: 3500 })
            setStep(cur => cur === 'gate' ? (fresh.subdomain ? 'dashboard' : 'subdomain') : cur)
            return
          }
        } catch {
          // Transient failure — keep polling until the deadline.
        }
      }
    } finally {
      if (verifyAttempt.current === attempt) {
        setVerifying(false)
        setSignInCode(null)
      }
    }
  }, [session, verifying, gauthEnabled, bootstrapClient])

  const skipGate = useCallback(() => {
    verifyAttempt.current += 1
    setVerifying(false)
    toast.dismiss('google-signin')
    setStep(cur => {
      if (cur !== 'gate') return cur
      return session?.subdomain ? 'dashboard' : 'subdomain'
    })
  }, [session?.subdomain])

  const applyPort = async (port: number) => {
    if (!session) return
    setIsBusy(true)
    try {
      const next = await updateExposedPort(session.id, port)
      tunnelPort.current = next
      setSession(cur => cur ? { ...cur, port: next } : cur)
      setPortInput(String(next))
      void checkListening(next)
      if (selectedTunnelId) {
        setPersistentTunnels(current => current.map(tunnel => tunnel.id === selectedTunnelId ? { ...tunnel, port: next } : tunnel))
        const connection = tunnelConnections.current.get(selectedTunnelId)
        if (connection) {
          connection.portRef.current = next
          connection.setPort(next)
        }
        const selected = persistentTunnels.find(tunnel => tunnel.id === selectedTunnelId)
        if (selected) {
          // The server points / at the new port along with it.
          const updated = await updateTunnel(session.id, { ...selected, port: next, pathRoutes: routesForShare(next, extraRoutes(selected)) })
          setPersistentTunnels(current => current.map(tunnel => tunnel.id === updated.id ? updated : tunnel))
        }
      }
      toast.success(`Now forwarding to localhost:${next}`)
    } catch (err) {
      toast.error(extractError(err))
    } finally { setIsBusy(false) }
  }

  const handleSubdomainSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!session) return
    const name = normalizeSubdomain(subdomainInput)
    if (name.length < 3 || name.length > 32) {
      toast.error('Use 3–32 lowercase letters, numbers or dashes.')
      return
    }
    setIsBusy(true)
    try {
      const availability = await checkSubdomainAvailability(name)
      if (!availability.available) {
        toast.error(availability.reserved
          ? 'That name is reserved. Try another one.'
          : 'That name is taken. Try another one.')
        return
      }
      await claimSubdomain(session.id, name)
      setSession(cur => cur ? { ...cur, subdomain: name, domains: cur.domains.includes(name) ? cur.domains : [...cur.domains, name] } : cur)
      setStep('dashboard')
      toast.success(`${name}.${ROOT_DOMAIN} is yours`)
    } catch (err) {
      toast.error(extractError(err))
    } finally { setIsBusy(false) }
  }

  const handlePortSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const p = Number(portInput)
    if (!Number.isInteger(p) || p < 1 || p > 65535) {
      toast.error('Use a port between 1 and 65535.')
      return
    }
    await applyPort(p)
  }

  const handleDomainSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!session || !domainInput.trim()) return
    setIsBusy(true)
    try {
      const { customDomain, dnsTarget } = await updateCustomDomain(session.id, domainInput.trim())
      setSession(cur => cur ? { ...cur, customDomain, dnsTarget } : cur)
      setDomainInput(customDomain)
      if (selectedTunnelId) {
        const selected = persistentTunnels.find(tunnel => tunnel.id === selectedTunnelId)
        if (selected) {
          const updated = await updateTunnel(session.id, { ...selected, customDomain })
          setPersistentTunnels(current => current.map(tunnel => tunnel.id === updated.id ? updated : tunnel))
        }
      }
      toast.success('Domain added. Now add the DNS record shown on this page.')
    } catch (err) {
      toast.error(extractError(err))
    } finally { setIsBusy(false) }
  }

  const handleAccessChange = async (tunnel: PersistentTunnel, access: ShareAccess, password?: string): Promise<boolean> => {
    if (!session) return false
    setIsBusy(true)
    try {
      const updated = await updateTunnel(session.id, { ...tunnel, access, ...(password ? { password } : {}) })
      setPersistentTunnels(current => current.map(item => item.id === updated.id ? updated : item))
      toast.success(access === 'public' ? 'Anyone with the link can open it now' : password ? 'Password saved' : 'Share is private')
      return true
    } catch (err) {
      toast.error(extractError(err))
      return false
    } finally { setIsBusy(false) }
  }

  const selectPersistentTunnel = (tunnel: PersistentTunnel) => {
    setSelectedTunnelId(tunnel.id)
    setSession(current => current ? {
      ...current,
      subdomain: tunnel.subdomain,
      port: tunnel.port,
      customDomain: tunnel.customDomain,
      requireAuth: tunnel.requireAuth,
      pathRoutes: tunnel.pathRoutes,
    } : current)
    setSubdomainInput(tunnel.subdomain)
    setPortInput(String(tunnel.port))
    setDomainInput(tunnel.customDomain)
    routesEdited.current = false
    setRouteRules(extraRoutes(tunnel))
    tunnelPort.current = tunnel.port
    const connection = tunnelConnections.current.get(tunnel.id)
    if (connection) {
      connection.portRef.current = tunnel.port
      tunnelClose.current = connection.close
    }
    void checkListening(tunnel.port)
  }

  /** Asks before a share takes an address another running share is serving. */
  const confirmSwitch = async (tunnel: PersistentTunnel): Promise<boolean> => {
    const holder = addressHolder(persistentTunnelsRef.current, tunnel)
    if (!holder) return true
    return confirm({
      title: 'Switch this address?',
      message: <>{shareLabel(holder)} is running on <strong>{tunnel.subdomain}.{ROOT_DOMAIN}</strong>. Switch the address to {shareLabel(tunnel)}? {shareLabel(holder)} is paused until you resume it.</>,
      confirmLabel: 'Switch',
    })
  }

  /** The server pauses whichever share gave up its address, so reload the list. */
  const refreshTunnels = async () => {
    if (!session) return
    const fresh = await listTunnels(session.id).catch(() => null)
    if (fresh) setPersistentTunnels(current => fresh.filter(tunnel => isSupportedType(tunnel.tunnelType)).map(tunnel => ({ ...tunnel, name: tunnel.name || current.find(item => item.id === tunnel.id)?.name })))
  }

  type RunOptions = { switchConfirmed?: boolean; quiet?: boolean }

  const stopMobileAgent = (tunnelId: string) => {
    const sid = readMobileSessionId(tunnelId)
    if (sid) void window.kexoz?.mobilePreviewStop?.(sid)
    clearMobileSession(tunnelId)
  }

  const ensureMobileAgent = async (tunnel: PersistentTunnel): Promise<PersistentTunnel> => {
    if (tunnel.tunnelType !== 'mobile') return tunnel
    const serial = readMobileSerial(tunnel.id)
    if (!serial) {
      throw new Error('This Android share has no device saved on this computer. Create a new Android Preview share.')
    }
    const existingId = readMobileSessionId(tunnel.id)
    if (existingId) {
      const sessions = await window.kexoz?.mobileSessions?.()
      const live = (sessions || []).find(s => s.id === existingId && s.serial === serial)
      if (live?.port) {
        if (live.port !== tunnel.port && session) {
          return updateTunnel(session.id, { ...tunnel, port: live.port, pathRoutes: [{ path: '/', port: live.port }], preview: true })
        }
        return { ...tunnel, port: live.port, preview: true }
      }
    }
    stopMobileAgent(tunnel.id)
    const started = await window.kexoz?.mobilePreviewStart?.({ serial })
    if (!started?.ok || !started.port || !started.sessionId) {
      throw new Error(started?.message || 'Could not connect to the Android device. Check USB debugging or start the emulator.')
    }
    saveMobileBinding(tunnel.id, started.sessionId, {
      serial,
      model: started.info?.model,
      androidVersion: started.info?.androidVersion,
      width: started.info?.width,
      height: started.info?.height,
    })
    if (started.port !== tunnel.port && session) {
      return updateTunnel(session.id, { ...tunnel, port: started.port, pathRoutes: [{ path: '/', port: started.port }], preview: true })
    }
    return { ...tunnel, port: started.port, preview: true }
  }

  const startPersistentTunnel = async (tunnel: PersistentTunnel, options: RunOptions = {}): Promise<boolean> => {
    if (!session) return false
    const holder = addressHolder(persistentTunnelsRef.current, tunnel)
    if (holder && !options.switchConfirmed && !await confirmSwitch(tunnel)) return false
    setIsBusy(true)
    try {
      const ready = await ensureMobileAgent(tunnel)
      selectPersistentTunnel(ready)
      const updated = await updateTunnel(session.id, { ...ready, active: true })
      setPersistentTunnels(current => current.map(item => item.id === updated.id ? updated : item))
      connectShare(session.id, updated)
      if (holder) await refreshTunnels()
      if (!options.quiet) {
        toast.success(holder
          ? `Sharing on ${shareUrl(updated).replace(/^https:\/\//, '')}. ${shareLabel(holder)} is paused.`
          : updated.tunnelType === 'mobile'
            ? `Android Preview live on ${shareUrl(updated).replace(/^https:\/\//, '')}`
            : `Sharing on ${shareUrl(updated).replace(/^https:\/\//, '')}`)
      }
      return true
    } catch (err) {
      if (tunnel.tunnelType === 'mobile') stopMobileAgent(tunnel.id)
      toast.error(extractError(err))
      return false
    } finally {
      setIsBusy(false)
    }
  }

  const stopPersistentTunnel = async (tunnel: PersistentTunnel, options: RunOptions = {}) => {
    if (!session) return
    setIsBusy(true)
    try {
      await updateTunnel(session.id, { ...tunnel, active: false })
      setPersistentTunnels(current => current.map(item => item.id === tunnel.id ? { ...item, active: false, status: item.status === 'active' ? 'stopped' : item.status } : item))
      closeConnection(tunnel.id)
      if (tunnel.tunnelType === 'mobile') stopMobileAgent(tunnel.id)
      if (tunnel.id === selectedTunnelId) tunnelClose.current = null
      if (!options.quiet) toast.success(`Stopped ${shareUrl(tunnel).replace(/^https:\/\//, '')}`)
    } catch (err) {
      toast.error(extractError(err))
    } finally {
      setIsBusy(false)
    }
  }

  const removePersistentTunnel = async (tunnel: PersistentTunnel) => {
    if (!session) return
    const accepted = await confirm({
      title: 'Delete this share?',
      message: tunnel.subdomain
        ? <>The link <strong>{tunnel.subdomain}.{ROOT_DOMAIN}</strong> stops working right away. The address stays yours, so you can use it again.</>
        : <>The address <strong>{shareUrl(tunnel)}</strong> stops working right away.</>,
      confirmLabel: 'Delete share',
      tone: 'danger',
    })
    if (!accepted) return
    setIsBusy(true)
    try {
      await deleteTunnel(session.id, tunnel.id)
      if (tunnel.id === selectedTunnelId) {
        tunnelClose.current = null
        setSelectedTunnelId(null)
      }
      closeConnection(tunnel.id)
      if (tunnel.tunnelType === 'mobile') {
        stopMobileAgent(tunnel.id)
        clearMobileBinding(tunnel.id)
      }
      setPersistentTunnels(current => current.filter(item => item.id !== tunnel.id))
      toast.success('Share deleted')
    } catch (err) {
      toast.error(extractError(err))
    } finally {
      setIsBusy(false)
    }
  }

  const setPersistentTunnelPaused = async (tunnel: PersistentTunnel, paused: boolean, options: RunOptions = {}): Promise<boolean> => {
    if (!session) return false
    const holder = !paused && tunnel.active ? addressHolder(persistentTunnelsRef.current, tunnel) : undefined
    if (holder && !options.switchConfirmed && !await confirmSwitch(tunnel)) return false
    setIsBusy(true)
    try {
      const updated = await setTunnelPaused(session.id, tunnel.id, paused)
      setPersistentTunnels(current => current.map(item => item.id === updated.id ? updated : item))
      if (holder) await refreshTunnels()
      if (!options.quiet) {
        toast.success(paused ? 'Paused. Visitors see a “paused” page for now.'
          : holder ? `Resumed. ${shareLabel(holder)} is paused.`
          : 'Resumed. Visitors can open the link again.')
      }
      return true
    } catch (err) {
      toast.error(extractError(err))
      return false
    } finally {
      setIsBusy(false)
    }
  }

  const renameTunnel = async (tunnel: PersistentTunnel, name: string) => {
    if (!session) return
    try {
      const updated = await updateTunnel(session.id, { ...tunnel, name: name.trim() })
      setPersistentTunnels(current => current.map(item => item.id === updated.id ? updated : item))
      forgetLegacyNames([tunnel.id])
    } catch (err) {
      toast.error(extractError(err))
    }
  }

  const createProject = async (name: string, tunnelIds: string[]): Promise<string | null> => {
    try {
      const id = await projectsApi.create(name, tunnelIds)
      toast.success(`Created ${name}`)
      return id || null
    } catch (err) {
      toast.error(extractError(err))
      return null
    }
  }

  const saveProject = async (project: Project, name: string, tunnelIds: string[]): Promise<boolean> => {
    try {
      await projectsApi.save(project, name, tunnelIds)
      toast.success('Project saved')
      return true
    } catch (err) {
      toast.error(extractError(err))
      return false
    }
  }

  const moveShare = async (tunnel: PersistentTunnel, projectId: string) => {
    try {
      await projectsApi.move(tunnel.id, projectId)
      const project = projectsApi.projects.find(item => item.id === projectId)
      toast.success(project ? `Moved ${shareLabel(tunnel)} to ${project.name}` : projectId ? `Moved ${shareLabel(tunnel)}` : `${shareLabel(tunnel)} is no longer in a project`)
    } catch (err) {
      toast.error(extractError(err))
    }
  }

  const removeProject = async (project: Project): Promise<boolean> => {
    const accepted = await confirm({
      title: `Delete ${project.name}?`,
      message: <>Its shares aren’t deleted; they move to Not in a project. <code>kexoz start {project.name}</code> stops working.</>,
      confirmLabel: 'Delete project',
      tone: 'danger',
    })
    if (!accepted) return false
    try {
      await projectsApi.remove(project)
      toast.success(`Deleted ${project.name}`)
      return true
    } catch (err) {
      toast.error(extractError(err))
      return false
    }
  }

  const projectShares = (project: Project) =>
    project.tunnelIds
      .map(id => persistentTunnelsRef.current.find(tunnel => tunnel.id === id))
      .filter((tunnel): tunnel is PersistentTunnel => Boolean(tunnel))

  const startProject = async (project: Project) => {
    const shares = projectShares(project)
    // Only one share serves an address, so start the first of each.
    const claimed = new Set(shares.filter(tunnel => tunnel.active && !tunnel.paused).map(tunnel => tunnel.subdomain).filter(Boolean))
    const pending: PersistentTunnel[] = []
    const skipped: PersistentTunnel[] = []
    for (const tunnel of shares) {
      if ((tunnel.active && !tunnel.paused) || shareStatus(tunnel) === 'expired') continue
      if (tunnel.subdomain && claimed.has(tunnel.subdomain)) {
        skipped.push(tunnel)
        continue
      }
      if (tunnel.subdomain) claimed.add(tunnel.subdomain)
      pending.push(tunnel)
    }
    const taken = pending.flatMap(tunnel => {
      const holder = addressHolder(persistentTunnelsRef.current, tunnel)
      return holder && !project.tunnelIds.includes(holder.id) ? [holder] : []
    })
    if (taken.length > 0) {
      const accepted = await confirm({
        title: 'Switch addresses to this project?',
        message: <>{[...new Set(taken.map(shareLabel))].join(', ')} {taken.length === 1 ? 'is' : 'are'} running on an address this project uses. Starting {project.name} pauses {taken.length === 1 ? 'it' : 'them'}.</>,
        confirmLabel: 'Switch and start',
      })
      if (!accepted) return
    }
    let started = 0
    for (const tunnel of pending) {
      let ok = true
      if (tunnel.paused) ok = await setPersistentTunnelPaused(tunnel, false, { switchConfirmed: true, quiet: true })
      if (ok && !tunnel.active) ok = await startPersistentTunnel({ ...tunnel, paused: false }, { switchConfirmed: true, quiet: true })
      if (ok) started += 1
    }
    if (taken.length > 0) await refreshTunnels()
    if (started > 0) toast.success(started === pending.length ? `${project.name} is running` : `Started ${started} of ${pending.length} shares in ${project.name}`)
    if (skipped.length > 0) {
      toast(`${skipped.map(shareLabel).join(', ')} ${skipped.length === 1 ? 'uses' : 'use'} the same address as another share in ${project.name}, so ${skipped.length === 1 ? 'it' : 'they'} stayed off. Give ${skipped.length === 1 ? 'it' : 'each'} its own address to run them together.`, { duration: 7000 })
    }
  }

  const stopProject = async (project: Project) => {
    const running = projectShares(project).filter(tunnel => tunnel.active)
    for (const tunnel of running) await stopPersistentTunnel(tunnel, { quiet: true })
    if (running.length > 0) toast.success(`Stopped ${project.name}`)
  }

  const openNewShare = (projectId?: string, routed = false, environment = '') => {
    setNewShareProject(projectId)
    setNewShareRouted(routed)
    setNewShareEnvironment(environment)
    setShowNewTunnel(true)
  }

  const environmentsByProject = useMemo(() => {
    const byId = new Map(persistentTunnels.map(tunnel => [tunnel.id, tunnel]))
    return Object.fromEntries(projectsApi.projects.map(project => {
      const names = new Set([''])
      for (const id of project.tunnelIds) names.add(byId.get(id)?.environment ?? '')
      return [project.id, [...names].sort()]
    }))
  }, [persistentTunnels, projectsApi.projects])

  const createProjectEnvironment = async (project: Project, name: string, from: string): Promise<boolean> => {
    try {
      const copies = await projectsApi.addEnvironment(project.id, name, from)
      setPersistentTunnels(current => [...current, ...copies])
      toast.success(`Created ${name} with ${copies.length} ${copies.length === 1 ? 'share' : 'shares'}`)
      return true
    } catch (err) {
      toast.error(extractError(err))
      return false
    }
  }

  const createShare = async (request: NewShareRequest) => {
    if (!session) return
    let mobileSessionId = ''
    let mobileMeta: { model?: string; androidVersion?: string; width?: number; height?: number } | undefined
    try {
      let projectId = request.projectId
      if (!projectId && request.newProjectName) {
        projectId = await projectsApi.create(request.newProjectName, [])
        if (!projectId) throw new Error('Could not create the project. Try again.')
      }
      const name = normalizeSubdomain(request.subdomain)
      let port = request.port
      if (request.tunnelType === 'mobile') {
        if (!request.mobileSerial) throw new Error('Select an Android device or emulator.')
        const started = await window.kexoz?.mobilePreviewStart?.({ serial: request.mobileSerial })
        if (!started?.ok || !started.port) {
          throw new Error(started?.message || 'Could not start Android Preview on this device.')
        }
        mobileSessionId = started.sessionId || ''
        mobileMeta = started.info
        port = started.port
        if (started.info?.model && !request.name) {
          request = { ...request, name: `${started.info.model} preview` }
        }
      }
      const created = await createTunnel(session.id, {
        name: request.name,
        projectId: projectId || undefined,
        subdomain: name,
        customDomain: '',
        port,
        requireAuth: false,
        pathRoutes: request.tunnelType === 'http' ? routesForShare(port, request.extraRoutes ?? []) : [{ path: '/', port }],
        tunnelType: request.tunnelType,
        access: request.access,
        permissions: request.permissions,
        password: request.password,
        duration: request.duration,
        preview: request.tunnelType === 'mobile' ? true : request.preview,
        environment: request.environment,
      })
      if (mobileSessionId && request.mobileSerial) {
        saveMobileBinding(created.id, mobileSessionId, {
          serial: request.mobileSerial,
          model: mobileMeta?.model,
          androidVersion: mobileMeta?.androidVersion,
          width: mobileMeta?.width,
          height: mobileMeta?.height,
        })
      }
      setPersistentTunnels(current => [...current, created])
      setShowNewTunnel(false)
      if (projectId) {
        void projectsApi.refresh()
        setActivePage('projects')
        setOpenProjectId(projectId)
      }
      await startPersistentTunnel(created, { switchConfirmed: true })
      if (request.tunnelType === 'mobile') {
        toast.success('Android Preview is live. Share the link — clients can request control in the browser.')
      }
    } catch (err) {
      if (mobileSessionId) void window.kexoz?.mobilePreviewStop?.(mobileSessionId)
      toast.error(extractError(err))
    }
  }

  const handleAddAddress = async (name: string): Promise<boolean> => {
    if (!session) return false
    try {
      const domains = await addDomain(session.id, name)
      setSession(cur => cur ? { ...cur, domains } : cur)
      toast.success(`Added ${name}.${ROOT_DOMAIN}`)
      return true
    } catch (err) {
      toast.error(extractError(err))
      return false
    }
  }

  const handleRemoveAddress = async (name: string) => {
    if (!session) return
    const accepted = await confirm({
      title: 'Remove this address?',
      message: <>Someone else could claim <strong>{name}.{ROOT_DOMAIN}</strong> after you remove it.</>,
      confirmLabel: 'Remove address',
      tone: 'danger',
    })
    if (!accepted) return
    setIsBusy(true)
    try {
      const domains = await removeDomain(session.id, name)
      setSession(cur => cur ? { ...cur, domains } : cur)
      toast.success(`Removed ${name}.${ROOT_DOMAIN}`)
    } catch (err) {
      toast.error(extractError(err))
    } finally {
      setIsBusy(false)
    }
  }

  const handleTunnelUpdated = (updated: PersistentTunnel) => {
    setPersistentTunnels(current => current.map(item => item.id === updated.id ? updated : item))
  }

  const addressOptions = (session?.domains ?? []).map(name => ({
    name,
    usedBy: persistentTunnels.filter(tunnel => tunnel.subdomain === name).map(shareLabel),
  }))

  const shareControls = (clientId: string): ShareControls => ({
    portInput,
    setPortInput,
    onPortSubmit: handlePortSubmit,
    isBusy,
    routeRules,
    onRouteRulesChange: editRouteRules,
    routePortStatus,
    persistentTunnels,
    selectedTunnelId,
    onSelectTunnel: selectPersistentTunnel,
    onStartTunnel: tunnel => void startPersistentTunnel(tunnel),
    onStopTunnel: tunnel => void stopPersistentTunnel(tunnel),
    onDeleteTunnel: tunnel => void removePersistentTunnel(tunnel),
    onPauseTunnel: (tunnel, paused) => void setPersistentTunnelPaused(tunnel, paused),
    portListening,
    onAccessChange: handleAccessChange,
    onRenameTunnel: (tunnel, name) => void renameTunnel(tunnel, name),
    clientId,
    onTunnelUpdated: handleTunnelUpdated,
    onOpenReview: tunnel => { setReviewNoteId(null); setReviewTunnelId(tunnel.id); setActivePage('review') },
    onOpenNote: (tunnel, note) => { setReviewTunnelId(tunnel.id); setReviewNoteId(note.id); setActivePage('review') },
  })

  const handleLogout = async () => {
    const accepted = await confirm({
      title: 'Sign out of Kexoz?',
      message: <>Your shares stop and this computer starts fresh. Signing in with Google again won’t bring back your addresses or plan yet, so only sign out if you’re done with this account.</>,
      confirmLabel: 'Sign out',
      tone: 'danger',
    })
    if (!accepted) return
    clearClientId()
    window.location.reload()
  }

  return (
    <>
      <Toaster position="bottom-right" gutter={8} toastOptions={TOAST_OPTIONS} />
      {showNewTunnel && session && (
        <NewShareModal
          onClose={() => setShowNewTunnel(false)}
          addresses={addressOptions}
          projects={projectsApi.projects}
          projectId={newShareProject ?? openProjectId ?? undefined}
          routed={newShareRouted}
          environments={environmentsByProject}
          environment={newShareEnvironment}
          onManageAddresses={() => { setShowNewTunnel(false); setActivePage('domains') }}
          onSubmit={createShare}
        />
      )}
      {confirmDialog}
      <AppShell>
        {step === 'dashboard' && session && (
          <Sidebar
            activePage={activePage}
            onNavigate={setActivePage}
            onNewShare={() => openNewShare()}
            session={session}
            liveShares={persistentTunnels.filter(tunnel => shareStatus(tunnel) === 'active').length}
            shareCount={persistentTunnels.length}
            requestCount={totalRequests}
            reviewCount={openFeedback}
            onLogin={() => void startGoogleVerify()}
            verifying={verifying}
          />
        )}

        {step === 'loading' && (
          <LoadingScreen
            statusMessage={statusMessage}
            errorMessage={loadError}
            onRetry={() => void bootstrapClient()}
          />
        )}

        {step === 'gate' && session && (
          <GateScreen
            onLogin={() => void startGoogleVerify()}
            onSkip={skipGate}
            verifying={verifying}
            code={signInCode}
          />
        )}

        {step === 'subdomain' && session && (
          <SubdomainScreen
            subdomainInput={subdomainInput}
            setSubdomainInput={setSubdomainInput}
            onSubmit={handleSubdomainSubmit}
            isBusy={isBusy}
          />
        )}

        {step === 'dashboard' && session && (
          <Suspense fallback={<div className="ps-main"><div className="ps-page-content"><LoadingBlock label="Opening workspace…" /></div></div>}>
            {activePage === 'dashboard' && (persistentTunnels.length === 0
              ? <WelcomePanel onNewShare={() => openNewShare()} />
              : <DashboardPage
                session={session}
                tunnels={persistentTunnels}
                totalRequests={totalRequests}
                requestLog={requestLog}
                bytesIn={bytesIn}
                bytesOut={bytesOut}
                dailyUsage={dailyUsage}
                connectionEvents={connectionEvents}
                feedbackNotes={overviewNotes}
                onNewShare={() => openNewShare()}
                onViewRequests={() => setActivePage('requests')}
                onViewShares={() => { setOpenProjectId(null); setActivePage('projects') }}
                onViewFeedback={() => setActivePage('review')}
              />
            )}

            {activePage === 'projects' && (
              <ProjectsPage
                {...shareControls(session.id)}
                clientId={session.id}
                projects={projectsApi.projects}
                projectsLoaded={projectsApi.loaded}
                openId={openProjectId}
                onOpenProject={setOpenProjectId}
                onNewShare={openNewShare}
                onMoveShare={moveShare}
                onCreateProject={createProject}
                onSaveProject={saveProject}
                onDeleteProject={removeProject}
                onStartProject={project => void startProject(project)}
                onStopProject={project => void stopProject(project)}
                onCreateEnvironment={createProjectEnvironment}
              />
            )}

            {activePage === 'review' && (
              <ReviewPage
                clientId={session.id}
                tunnels={persistentTunnels}
                selectedId={reviewTunnelId}
                onSelect={setReviewTunnelId}
                focusNoteId={reviewNoteId}
                onFocusNoteHandled={() => setReviewNoteId(null)}
              />
            )}

            {activePage === 'requests' && (
              <RequestsPage
                requestLog={requestLog}
                onClear={clearLog}
                retention={retention}
                onRetentionChange={setRetention}
                hosts={requestHosts}
                tunnels={persistentTunnels}
              />
            )}

            {activePage === 'domains' && (
              <DomainsPage
                session={session}
                tunnels={persistentTunnels}
                onAddAddress={handleAddAddress}
                onRemoveAddress={(name) => void handleRemoveAddress(name)}
                domainInput={domainInput}
                setDomainInput={setDomainInput}
                onDomainSubmit={handleDomainSubmit}
                isBusy={isBusy}
              />
            )}

            {activePage === 'team' && (
              <TeamPage
                session={session}
                onVerify={() => void startGoogleVerify()}
                verifying={verifying}
                gauthEnabled={gauthEnabled}
                onSignOut={() => void handleLogout()}
              />
            )}

            {activePage === 'account' && (
              <AccountPage
                session={session}
                onVerify={() => void startGoogleVerify()}
                verifying={verifying}
                gauthEnabled={gauthEnabled}
                onSignOut={() => void handleLogout()}
              />
            )}

            {activePage === 'settings' && (
              <SettingsPage
                session={session}
                onOpenTeam={() => setActivePage('team')}
                onOpenAccount={() => setActivePage('account')}
                onVerify={() => void startGoogleVerify()}
                verifying={verifying}
                gauthEnabled={gauthEnabled}
                onSignOut={() => void handleLogout()}
              />
            )}
          </Suspense>
        )}
      </AppShell>
    </>
  )
}
