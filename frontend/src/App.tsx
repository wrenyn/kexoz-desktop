import './styles/tokens.css'
import './styles/base.css'
import './styles/animations.css'

import { type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { Toaster, toast } from 'react-hot-toast'
import axios from 'axios'

import {
  type ClientSession, type ConnectionState, type FlowStep, type PersistentTunnel, type ShareAccess,
  API_BASE_URL, ROOT_DOMAIN,
  ensureClientIdentity, checkSubdomainAvailability, claimSubdomain,
  updateExposedPort, updateCustomDomain, fetchClientStats,
  googleLinkLoginUrl, fetchLinkStatus, updateClientRoutes,
  listTunnels, createTunnel, updateTunnel, deleteTunnel, setTunnelPaused,
  addDomain, removeDomain
} from './lib/api'
import { isGatedType, shareStatus, shareUrl, type FolderShareConfig, type NewShareRequest } from './lib/shares'
import { useFolderShares } from './hooks/useFolderShares'
import { useConnectionHistory } from './hooks/useConnectionHistory'
import { clearClientId, getClientId, setClientId } from './lib/storage'
import { normalizeSubdomain, extractError } from './lib/utils'
import { createTunnelConnection } from './lib/tunnel'
import { useTheme } from './hooks/useTheme'
import { useRequestLog } from './hooks/useRequestLog'
import { useTunnelNames } from './hooks/useTunnelNames'
import { useConfirm } from './hooks/useConfirm'

import AppShell from './components/layout/AppShell'
import Sidebar from './components/layout/Sidebar'
import { NAV_ITEMS, type Page } from './lib/navigation'
import LoadingScreen from './components/screens/LoadingScreen'
import GateScreen from './components/screens/GateScreen'
import SubdomainScreen from './components/screens/SubdomainScreen'
import DashboardPage from './components/pages/DashboardPage'
import TunnelsPage from './components/pages/TunnelsPage'
import RequestsPage from './components/pages/RequestsPage'
import DomainsPage from './components/pages/DomainsPage'
import SettingsPage from './components/pages/SettingsPage'
import FeedbackPage from './components/pages/FeedbackPage'
import ProjectsPage from './components/pages/ProjectsPage'
import NewShareModal from './components/modals/NewShareModal'

const TOAST_OPTIONS = {
  duration: 3500,
  style: {
    boxShadow: 'var(--shadow-md)',
    background: 'var(--bg-elevated)',
    color: 'var(--text)',
    border: '1px solid var(--border-bright)',
    borderRadius: 10,
    padding: '10px 14px',
    maxWidth: 380,
    fontSize: 13,
    fontWeight: 500,
    lineHeight: 1.45,
  },
  success: { iconTheme: { primary: 'var(--green)', secondary: 'var(--bg-elevated)' } },
  error: { duration: 6000, iconTheme: { primary: 'var(--red)', secondary: 'var(--bg-elevated)' } },
  loading: { iconTheme: { primary: 'var(--text-muted)', secondary: 'var(--border)' } },
}

export default function App() {
  const [step, setStep] = useState<FlowStep>('loading')
  const [activePage, setActivePage] = useState<Page>(() => {
    // Return to the page the operator was last on after a restart.
    const saved = window.localStorage.getItem('kexoz-active-page')
    return (NAV_ITEMS.some(item => item.id === saved) ? saved : 'dashboard') as Page
  })
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
  const [showNewTunnel, setShowNewTunnel] = useState(false)
  const [persistentTunnels, setPersistentTunnels] = useState<PersistentTunnel[]>([])
  const [selectedTunnelId, setSelectedTunnelId] = useState<string | null>(null)
  const [routeRules, setRouteRules] = useState<Array<{ path: string; port: number }>>(() => {
    try {
      const saved = window.localStorage.getItem('kexoz-route-rules')
      return saved ? JSON.parse(saved) as Array<{ path: string; port: number }> : []
    } catch {
      return []
    }
  })
  const [portListening, setPortListening] = useState<boolean | null>(null)
  const [routePortStatus, setRoutePortStatus] = useState<Record<number, boolean | null>>({})
  const [bytesIn, setBytesIn] = useState(0)
  const [bytesOut, setBytesOut] = useState(0)
  const [dailyUsage, setDailyUsage] = useState<import('./lib/api').UsagePoint[]>([])
  const { theme, toggleTheme } = useTheme()
  const { requestLog, totalRequests, retention, setRetention, addLogEntry, clearLog } = useRequestLog()
  const { names: tunnelNames, setName: onRenameTunnel } = useTunnelNames()
  const { confirm, dialog: confirmDialog } = useConfirm()
  const { events: connectionEvents, record: recordConnection } = useConnectionHistory()

  // Ctrl/Cmd+number jumps between pages in sidebar order; Ctrl/Cmd+N starts a new share.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey) return
      const target = event.target as HTMLElement | null
      if (target?.isContentEditable || target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA') return
      const pages: Record<string, Page> = Object.fromEntries(NAV_ITEMS.map(item => [item.shortcut, item.id]))
      if (event.key.toLowerCase() === 'n') {
        event.preventDefault()
        setActivePage('tunnels')
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
  const routesRef = useRef<Array<{ path: string; port: number }>>([])
  const tunnelClose = useRef<(() => void) | null>(null)
  const tunnelConnections = useRef(new Map<string, { close: () => void; setPort: (port: number) => void; portRef: { current: number | null }; routesRef: { current: Array<{ path: string; port: number }> } }>())
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

  const openTunnelConnection = useCallback((clientId: string, tunnelId?: string, port?: number, routes?: Array<{ path: string; port: number }>, tunnelType?: string) => {
    const key = tunnelId ?? 'legacy'
    tunnelConnections.current.get(key)?.close()
    const portRef = tunnelId ? { current: port ?? null } : tunnelPort
    const connectionRoutesRef = tunnelId ? { current: routes ?? [] } : routesRef
    const tunnel = createTunnelConnection({
      apiBaseUrl: API_BASE_URL,
      clientId,
      tunnelId,
      tunnelType,
      portRef,
      onStateChange: (state, reason) => setShareState(key, state, reason),
      onLogEntry: addLogEntry,
      routesRef: connectionRoutesRef,
    })
    tunnelConnections.current.set(key, { close: tunnel.close, setPort: tunnel.setPort, portRef, routesRef: connectionRoutesRef })
    tunnelClose.current = tunnel.close
  }, [addLogEntry, setShareState])

  const closeConnection = useCallback((key: string) => {
    tunnelConnections.current.get(key)?.close()
    tunnelConnections.current.delete(key)
    setShareState(key, null)
  }, [setShareState])

  const { folders: folderShares, setFolder, removeFolder } = useFolderShares()
  const folderSharesRef = useRef(folderShares)
  folderSharesRef.current = folderShares

  /** Folder shares tunnel to a loopback file server that must be running first. */
  const connectShare = useCallback(async (clientId: string, tunnel: PersistentTunnel, folder?: FolderShareConfig) => {
    if (tunnel.tunnelType !== 'folder') {
      openTunnelConnection(clientId, tunnel.id, tunnel.port, tunnel.pathRoutes, tunnel.tunnelType)
      return
    }
    const config = folder ?? folderSharesRef.current[tunnel.id]
    if (!config) throw new Error(`${tunnel.subdomain} shares a folder from another device. Start it there.`)
    if (!window.kexoz?.startFolderServer) throw new Error('Folder sharing needs the Kexoz desktop app.')
    const { port } = await window.kexoz.startFolderServer({
      shareId: tunnel.id,
      root: config.root,
      readOnly: tunnel.permissions !== 'read-write',
      excludes: config.excludes,
      hosts: [`${tunnel.subdomain}.${ROOT_DOMAIN}`, tunnel.customDomain].filter(Boolean),
      maxDownloads: config.maxDownloads,
    })
    openTunnelConnection(clientId, tunnel.id, port, [{ path: '/', port }], tunnel.tunnelType)
  }, [openTunnelConnection])

  const disconnectShare = useCallback((tunnel: PersistentTunnel) => {
    closeConnection(tunnel.id)
    if (tunnel.tunnelType === 'folder') void window.kexoz?.stopFolderServer?.(tunnel.id)
  }, [closeConnection])

  const requestHosts = useMemo(() => {
    const names = [session?.subdomain, ...(session?.domains ?? [])].filter(Boolean).map(name => `${name}.${ROOT_DOMAIN}`)
    const custom = [session?.customDomain, ...persistentTunnels.filter(t => isGatedType(t.tunnelType)).map(t => t.customDomain)]
    return [...new Set([...names, ...custom].filter((host): host is string => Boolean(host)).map(host => host.toLowerCase()))]
  }, [session, persistentTunnels])

  const persistentTunnelsRef = useRef(persistentTunnels)
  persistentTunnelsRef.current = persistentTunnels

  useEffect(() => {
    routesRef.current = routeRules
    window.localStorage.setItem('kexoz-route-rules', JSON.stringify(routeRules))
    if (!session?.id || step !== 'dashboard') return
    const clientId = session.id
    // Route rules change on every keystroke, so save them once typing pauses.
    const timer = window.setTimeout(() => {
      void updateClientRoutes(clientId, routeRules)
      if (selectedTunnelId && routeRules.length > 0) {
        const selected = persistentTunnelsRef.current.find(tunnel => tunnel.id === selectedTunnelId)
        if (selected) {
          const connection = tunnelConnections.current.get(selectedTunnelId)
          if (connection) connection.routesRef.current = routeRules
          void updateTunnel(clientId, { ...selected, pathRoutes: routeRules })
        }
      }
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
      const savedTunnels = await listTunnels(nextSession.id).catch(() => [])
      const selected = savedTunnels.find(tunnel => tunnel.active) ?? savedTunnels[0]
      setPersistentTunnels(savedTunnels)
      setSelectedTunnelId(selected?.id ?? null)
      const selectedPort = selected?.port ?? nextSession.port
      const selectedRoutes = selected?.pathRoutes?.length ? selected.pathRoutes : nextSession.pathRoutes
      setPortInput(selectedPort ? String(selectedPort) : '')
      setSubdomainInput(selected?.subdomain ?? nextSession.subdomain)
      setDomainInput(selected?.customDomain ?? nextSession.customDomain)
      setRouteRules(selectedRoutes.length ? selectedRoutes : routesRef.current)
      tunnelPort.current = selectedPort
      routesRef.current = selectedRoutes
      void checkListening(selectedPort)

      const activeTunnels = savedTunnels.filter(tunnel => tunnel.active)
      if (activeTunnels.length > 0) {
        for (const tunnel of activeTunnels) {
          await connectShare(nextSession.id, tunnel).catch(err => toast.error(extractError(err)))
        }
      } else if (selected?.tunnelType !== 'folder') {
        openTunnelConnection(nextSession.id, selected?.id, selected?.port, selected?.pathRoutes, selected?.tunnelType)
      }

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
  }, [checkListening, connectShare, openTunnelConnection])

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
    toast.loading('Finish signing in with Google in your browser', { id: 'google-signin', duration: 8000 })
    window.open(googleLinkLoginUrl(session.id), '_blank', 'noopener')
    const deadline = Date.now() + 5 * 60 * 1000
    try {
      for (;;) {
        await new Promise(r => setTimeout(r, 2000))
        if (verifyAttempt.current !== attempt) return
        if (Date.now() > deadline) {
          toast.error('Sign-in timed out. Try again.', { id: 'google-signin' })
          return
        }
        try {
          const status = await fetchLinkStatus(session.id)
          if (verifyAttempt.current !== attempt) return
          if (status.linked) {
            const fresh = await ensureClientIdentity(session.id)
            if (verifyAttempt.current !== attempt) return
            setClientId(fresh.id)
            setSession(fresh)
            setPortInput(fresh.port ? String(fresh.port) : '')
            setSubdomainInput(fresh.subdomain)
            setDomainInput(fresh.customDomain)
            toast.success('Signed in. You now have the full free plan.', { id: 'google-signin' })
            setStep(cur => cur === 'gate' ? (fresh.subdomain ? 'dashboard' : 'subdomain') : cur)
            return
          }
        } catch {
          // Transient failure — keep polling until the deadline.
        }
      }
    } finally {
      if (verifyAttempt.current === attempt) setVerifying(false)
    }
  }, [session, verifying, gauthEnabled])

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
        if (selected) void updateTunnel(session.id, { ...selected, port: next })
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
      const customDomain = await updateCustomDomain(session.id, domainInput.trim())
      setSession(cur => cur ? { ...cur, customDomain } : cur)
      setDomainInput(customDomain)
      if (selectedTunnelId) {
        const selected = persistentTunnels.find(tunnel => tunnel.id === selectedTunnelId)
        if (selected) {
          const updated = await updateTunnel(session.id, { ...selected, customDomain })
          setPersistentTunnels(current => current.map(tunnel => tunnel.id === updated.id ? updated : tunnel))
        }
      }
      toast.success('Custom domain added. Now add the DNS record.')
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
    setRouteRules(tunnel.pathRoutes)
    tunnelPort.current = tunnel.port
    routesRef.current = tunnel.pathRoutes
    const connection = tunnelConnections.current.get(tunnel.id)
    if (connection) {
      connection.portRef.current = tunnel.port
      connection.routesRef.current = tunnel.pathRoutes
      tunnelClose.current = connection.close
    }
    void checkListening(tunnel.tunnelType === 'folder' ? null : tunnel.port)
  }

  const startPersistentTunnel = async (tunnel: PersistentTunnel, folder?: FolderShareConfig) => {
    if (!session) return
    setIsBusy(true)
    try {
      selectPersistentTunnel(tunnel)
      const updated = await updateTunnel(session.id, { ...tunnel, active: true })
      setPersistentTunnels(current => current.map(item => item.id === updated.id ? updated : item))
      try {
        await connectShare(session.id, updated, folder)
      } catch (err) {
        const reverted = await updateTunnel(session.id, { ...updated, active: false }).catch(() => ({ ...updated, active: false }))
        setPersistentTunnels(current => current.map(item => item.id === reverted.id ? reverted : item))
        throw err
      }
      toast.success(`Sharing on ${shareUrl(updated).replace(/^https:\/\//, '')}`)
    } catch (err) {
      toast.error(extractError(err))
    } finally {
      setIsBusy(false)
    }
  }

  const stopPersistentTunnel = async (tunnel: PersistentTunnel) => {
    if (!session) return
    setIsBusy(true)
    try {
      await updateTunnel(session.id, { ...tunnel, active: false })
      setPersistentTunnels(current => current.map(item => item.id === tunnel.id ? { ...item, active: false, status: item.status === 'active' ? 'stopped' : item.status } : item))
      disconnectShare(tunnel)
      if (tunnel.id === selectedTunnelId) tunnelClose.current = null
      toast.success(`Stopped ${shareUrl(tunnel).replace(/^https:\/\//, '')}`)
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
      disconnectShare(tunnel)
      removeFolder(tunnel.id)
      setPersistentTunnels(current => current.filter(item => item.id !== tunnel.id))
      toast.success('Share deleted')
    } catch (err) {
      toast.error(extractError(err))
    } finally {
      setIsBusy(false)
    }
  }

  const setPersistentTunnelPaused = async (tunnel: PersistentTunnel, paused: boolean) => {
    if (!session) return
    setIsBusy(true)
    try {
      const updated = await setTunnelPaused(session.id, tunnel.id, paused)
      setPersistentTunnels(current => current.map(item => item.id === updated.id ? updated : item))
      toast.success(paused ? 'Paused. Visitors see a “paused” page for now.' : 'Resumed. Visitors can open the link again.')
    } catch (err) {
      toast.error(extractError(err))
    } finally {
      setIsBusy(false)
    }
  }

  const createShare = async (request: NewShareRequest) => {
    if (!session) return
    try {
      const name = normalizeSubdomain(request.subdomain)
      const isFolder = request.tunnelType === 'folder'
      // Folder shares get their real port from the local file server at start.
      const port = isFolder ? 1 : request.port
      const created = await createTunnel(session.id, {
        subdomain: name,
        customDomain: '',
        port,
        requireAuth: false,
        pathRoutes: [{ path: '/', port }],
        tunnelType: request.tunnelType,
        access: request.access,
        permissions: request.permissions,
        password: request.password,
        duration: request.duration,
        preview: request.preview,
      })
      if (request.folder) setFolder(created.id, request.folder)
      setPersistentTunnels(current => [...current, created])
      setShowNewTunnel(false)
      await startPersistentTunnel(created, request.folder)
    } catch (err) {
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

  const usedAddresses = new Set(persistentTunnels.map(tunnel => tunnel.subdomain))
  const freeAddresses = (session?.domains ?? []).filter(name => !usedAddresses.has(name))

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
          addresses={freeAddresses}
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
            onNewShare={() => setShowNewTunnel(true)}
            session={session}
            liveShares={persistentTunnels.filter(tunnel => shareStatus(tunnel) === 'active').length}
            shareCount={persistentTunnels.length}
            requestCount={totalRequests}
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
            theme={theme}
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
          <>
            {activePage === 'dashboard' && (
              <DashboardPage
                session={session}
                tunnels={persistentTunnels}
                totalRequests={totalRequests}
                requestLog={requestLog}
                bytesIn={bytesIn}
                bytesOut={bytesOut}
                dailyUsage={dailyUsage}
                connectionEvents={connectionEvents}
                onNewShare={() => setShowNewTunnel(true)}
                onViewRequests={() => setActivePage('requests')}
                onViewShares={() => setActivePage('tunnels')}
              />
            )}

            {activePage === 'projects' && (
              <ProjectsPage
                clientId={session.id}
                tunnels={persistentTunnels}
                tunnelNames={tunnelNames}
                isBusy={isBusy}
                onStartTunnel={startPersistentTunnel}
                onStopTunnel={stopPersistentTunnel}
              />
            )}

            {activePage === 'feedback' && (
              <FeedbackPage
                clientId={session.id}
                tunnels={persistentTunnels}
                tunnelNames={tunnelNames}
                onOpenShares={() => setActivePage('tunnels')}
              />
            )}

            {activePage === 'tunnels' && (
              <TunnelsPage
                portInput={portInput}
                setPortInput={setPortInput}
                onPortSubmit={handlePortSubmit}
                isBusy={isBusy}
                routeRules={routeRules}
                onRouteRulesChange={setRouteRules}
                routePortStatus={routePortStatus}
                persistentTunnels={persistentTunnels}
                selectedTunnelId={selectedTunnelId}
                onSelectTunnel={selectPersistentTunnel}
                onStartTunnel={(tunnel) => void startPersistentTunnel(tunnel)}
                onStopTunnel={(tunnel) => void stopPersistentTunnel(tunnel)}
                onDeleteTunnel={(tunnel) => void removePersistentTunnel(tunnel)}
                onPauseTunnel={(tunnel, paused) => void setPersistentTunnelPaused(tunnel, paused)}
                folderShares={folderShares}
                portListening={portListening}
                onNewTunnel={() => setShowNewTunnel(true)}
                onAccessChange={handleAccessChange}
                tunnelNames={tunnelNames}
                onRenameTunnel={onRenameTunnel}
                clientId={session.id}
                onTunnelUpdated={handleTunnelUpdated}
                onViewFeedback={() => setActivePage('feedback')}
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
                tunnelNames={tunnelNames}
                onAddAddress={handleAddAddress}
                onRemoveAddress={(name) => void handleRemoveAddress(name)}
                domainInput={domainInput}
                setDomainInput={setDomainInput}
                onDomainSubmit={handleDomainSubmit}
                isBusy={isBusy}
              />
            )}

            {activePage === 'settings' && (
              <SettingsPage
                theme={theme}
                onToggleTheme={toggleTheme}
                session={session}
                onVerify={() => void startGoogleVerify()}
                verifying={verifying}
                gauthEnabled={gauthEnabled}
                onSignOut={() => void handleLogout()}
              />
            )}
          </>
        )}
      </AppShell>
    </>
  )
}
