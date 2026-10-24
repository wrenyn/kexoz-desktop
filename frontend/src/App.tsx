import './styles/tokens.css'
import './styles/base.css'
import './styles/animations.css'

import { type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { Toaster, toast } from 'react-hot-toast'
import axios from 'axios'

import {
  type ClientSession, type ConnectionState, type FlowStep, type PersistentTunnel,
  API_BASE_URL, ROOT_DOMAIN,
  ensureClientIdentity, checkSubdomainAvailability, claimSubdomain,
  updateExposedPort, updateCustomDomain, updateClientAuth, fetchClientStats,
  googleLinkLoginUrl, fetchLinkStatus, tierOf, createCheckoutSession, updateClientRoutes,
  listTunnels, createTunnel, updateTunnel, deleteTunnel, setTunnelPaused
} from './lib/api'
import type { FolderShareConfig, NewShareRequest } from './lib/shares'
import { useFolderShares } from './hooks/useFolderShares'
import { clearClientId, getClientId, setClientId } from './lib/storage'
import { normalizeSubdomain, extractError } from './lib/utils'
import { createTunnelConnection } from './lib/tunnel'
import { useTheme } from './hooks/useTheme'
import { useRequestLog } from './hooks/useRequestLog'
import { useTunnelNames } from './hooks/useTunnelNames'

import AppShell from './components/layout/AppShell'
import Sidebar from './components/layout/Sidebar'
import { NAV_ITEMS, type Page } from './lib/navigation'
import LoadingScreen from './components/screens/LoadingScreen'
import GateScreen from './components/screens/GateScreen'
import SubdomainScreen from './components/screens/SubdomainScreen'
import VerifyBanner from './components/dashboard/VerifyBanner'
import DashboardPage from './components/pages/DashboardPage'
import TunnelsPage from './components/pages/TunnelsPage'
import RequestsPage from './components/pages/RequestsPage'
import DomainsPage from './components/pages/DomainsPage'
import SettingsPage from './components/pages/SettingsPage'
import UpgradeModal from './components/modals/UpgradeModal'

// One shared toast configuration: the app renders a <Toaster> in both the gate
// and the dashboard branches, so they must look and behave identically.
const TOAST_OPTIONS = {
  duration: 4000,
  style: {
    background: 'var(--bg-elevated)',
    color: 'var(--text)',
    border: '1px solid var(--border)',
    fontSize: 13,
  },
  success: { iconTheme: { primary: 'var(--green)', secondary: 'var(--bg-elevated)' } },
  error: { duration: 6000, iconTheme: { primary: 'var(--red)', secondary: 'var(--bg-elevated)' } },
}

export default function App() {
  const [step, setStep] = useState<FlowStep>('loading')
  const [activePage, setActivePage] = useState<Page>(() => {
    // Return to the page the operator was last on after a restart.
    const saved = window.localStorage.getItem('kexoz-active-page')
    return (NAV_ITEMS.some(item => item.id === saved) ? saved : 'dashboard') as Page
  })
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() =>
    window.localStorage.getItem('kexoz-sidebar-collapsed') === 'true'
  )
  const [session, setSession] = useState<ClientSession | null>(null)

  useEffect(() => {
    window.localStorage.setItem('kexoz-active-page', activePage)
  }, [activePage])

  // Ctrl/Cmd+1…5 jump between pages, in the order shown in the sidebar.
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.altKey || event.shiftKey) return
      const index = Number(event.key)
      if (!Number.isInteger(index) || index < 1 || index > NAV_ITEMS.length) return
      const target = event.target as HTMLElement | null
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return
      event.preventDefault()
      setActivePage(NAV_ITEMS[index - 1].id as Page)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  const [subdomainInput, setSubdomainInput] = useState('')
  const [portInput, setPortInput] = useState('')
  const [domainInput, setDomainInput] = useState('')

  const [statusMessage, setStatusMessage] = useState('Starting secure tunnel client...')
  const [isBusy, setIsBusy] = useState(false)
  const [copyFeedback, setCopyFeedback] = useState<'idle' | 'copied' | 'failed'>('idle')
  const [connState, setConnState] = useState<ConnectionState>('idle')
  const [gauthEnabled, setGauthEnabled] = useState(false)
  const [verifying, setVerifying] = useState(false)
  const [connectedAt, setConnectedAt] = useState<number | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const [showNewTunnel, setShowNewTunnel] = useState(false)
  const [showUpgradeModal, setShowUpgradeModal] = useState(false)
  const [autoStart, setAutoStart] = useState(() => window.localStorage.getItem('kexoz-autostart') === 'true')
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

  // Info and Error states removed in favor of toast

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey)) return
      const target = event.target as HTMLElement | null
      if (target?.isContentEditable || target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA') return
      const pages: Record<string, Page> = { '1': 'dashboard', '2': 'tunnels', '3': 'requests', '4': 'domains', '5': 'settings' }
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

  const prevConnState = useRef<ConnectionState>('idle')
  useEffect(() => {
    const prev = prevConnState.current
    prevConnState.current = connState
    if (prev === 'connected' && connState === 'disconnected') {
      toast.loading('Connection lost. Reconnecting...', { id: 'conn-state', duration: Infinity })
    } else if (prev === 'disconnected' && connState === 'connected') {
      toast.success('Reconnected!', { id: 'conn-state', duration: 3000 })
    } else if (prev === 'connecting' && connState === 'connected' && step === 'dashboard') {
      // Already connected for first time - no toast needed, UI shows it
      toast.dismiss('conn-state')
    }
  }, [connState, step])


  const tunnelPort = useRef<number | null>(null)
  const routesRef = useRef<Array<{ path: string; port: number }>>([])
  const tunnelClose = useRef<(() => void) | null>(null)
  const tunnelConnections = useRef(new Map<string, { close: () => void; portRef: { current: number | null }; routesRef: { current: Array<{ path: string; port: number }> } }>())
  const verifyAttempt = useRef(0)
  const lastPortListening = useRef<boolean | null>(null)

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
      onStateChange: (state, message) => {
        setConnState(state)
        if (state === 'connected') setConnectedAt(Date.now())
        if (state === 'disconnected') setConnectedAt(null)
        if (message) setStatusMessage(message)
      },
      onLogEntry: addLogEntry,
      routesRef: connectionRoutesRef,
    })
    tunnelConnections.current.set(key, { close: tunnel.close, portRef, routesRef: connectionRoutesRef })
    tunnelClose.current = tunnel.close
  }, [addLogEntry])

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
    })
    openTunnelConnection(clientId, tunnel.id, port, [{ path: '/', port }], tunnel.tunnelType)
  }, [openTunnelConnection])

  const disconnectShare = useCallback((tunnel: PersistentTunnel) => {
    tunnelConnections.current.get(tunnel.id)?.close()
    tunnelConnections.current.delete(tunnel.id)
    if (tunnel.tunnelType === 'folder') void window.kexoz?.stopFolderServer?.(tunnel.id)
  }, [])

  const publicUrl = useMemo(() => {
    if (!session?.subdomain) return ''
    return `https://${session.subdomain}.${ROOT_DOMAIN}`
  }, [session])

  const uptimeSeconds = connectedAt && connState === 'connected'
    ? Math.max(0, Math.floor((now - connectedAt) / 1000))
    : 0

  useEffect(() => {
    routesRef.current = routeRules
    window.localStorage.setItem('kexoz-route-rules', JSON.stringify(routeRules))
    if (session?.id && step === 'dashboard') {
      void updateClientRoutes(session.id, routeRules)
      if (selectedTunnelId && routeRules.length > 0) {
        const selected = persistentTunnels.find(tunnel => tunnel.id === selectedTunnelId)
        if (selected) {
          const connection = tunnelConnections.current.get(selectedTunnelId)
          if (connection) connection.routesRef.current = routeRules
          void updateTunnel(session.id, { ...selected, pathRoutes: routeRules })
        }
      }
    }
  }, [routeRules, session?.id, selectedTunnelId, persistentTunnels, step])

  useEffect(() => {
    if (window.kexoz?.updateTray) {
      window.kexoz.updateTray(persistentTunnels)
    }
  }, [persistentTunnels, connState])

  useEffect(() => {
    if (window.kexoz?.setAutoStart) {
      window.kexoz.setAutoStart(autoStart)
    }
    window.localStorage.setItem('kexoz-autostart', String(autoStart))
  }, [autoStart])

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
          title: 'Kexoz: local app offline',
          body: `localhost:${port} is no longer accepting connections.`,
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
    if (connState !== 'connected') return
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [connState])

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
    setIsBusy(true)
    toast.dismiss()
    setConnState('connecting')

    try {
      const storedId = getClientId()
      setStatusMessage(storedId ? 'Validating saved client identity...' : 'Generating a new client identity...')

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
      setConnState('disconnected')
      toast.error(extractError(error))
      setStatusMessage('Could not reach the Kexoz API.')
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
      toast.error('Google verification is not enabled on this server.')
      return
    }
    const attempt = ++verifyAttempt.current
    setVerifying(true)
    toast.dismiss()
    toast.success('Complete Google sign-in in your browser…')
    window.open(googleLinkLoginUrl(session.id), '_blank', 'noopener')
    const deadline = Date.now() + 5 * 60 * 1000
    try {
      for (;;) {
        await new Promise(r => setTimeout(r, 2000))
        if (verifyAttempt.current !== attempt) return
        if (Date.now() > deadline) {
          toast.error('Verification timed out. Please try again.')
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
            toast.success('Google linked — 1 GB bandwidth unlocked.')
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
    toast.success('Continuing as guest with 100 MB bandwidth. Verify anytime for 1 GB free.')
    setStep(cur => {
      if (cur !== 'gate') return cur
      return session?.subdomain ? 'dashboard' : 'subdomain'
    })
  }, [session?.subdomain])

  const applyPort = async (port: number) => {
    if (!session) return
    setIsBusy(true); toast.dismiss(); toast.success('Updating exposed port...')
    try {
      const next = await updateExposedPort(session.id, port)
      tunnelPort.current = next
      setSession(cur => cur ? { ...cur, port: next } : cur)
      setPortInput(String(next))
      void checkListening(next)
      if (selectedTunnelId) {
        setPersistentTunnels(current => current.map(tunnel => tunnel.id === selectedTunnelId ? { ...tunnel, port: next } : tunnel))
        const connection = tunnelConnections.current.get(selectedTunnelId)
        if (connection) connection.portRef.current = next
        const selected = persistentTunnels.find(tunnel => tunnel.id === selectedTunnelId)
        if (selected) void updateTunnel(session.id, { ...selected, port: next })
      }
      toast.success(`Forwarding localhost:${next}`)
    } catch (err) {
      toast.error(extractError(err))
    } finally { setIsBusy(false) }
  }

  const handleSubdomainSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!session) return
    const name = normalizeSubdomain(subdomainInput)
    if (name.length < 3 || name.length > 32) {
      toast.error('Subdomain must be 3–32 characters using letters, numbers, or hyphens.')
      return
    }
    setIsBusy(true)
    try {
      const availability = await checkSubdomainAvailability(name)
      if (!availability.available) {
        toast.error(availability.reserved
          ? 'That subdomain is reserved for Kexoz infrastructure. Try another one.'
          : 'That subdomain is already taken. Try another one.')
        return
      }
      await claimSubdomain(session.id, name)
      setSession(cur => cur ? { ...cur, subdomain: name } : cur)
      setStep('dashboard')
      toast.success('Subdomain reserved.')
    } catch (err) {
      toast.error(extractError(err))
    } finally { setIsBusy(false) }
  }

  const handlePortSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const p = Number(portInput)
    if (!Number.isInteger(p) || p < 1 || p > 65535) {
      toast.error('Enter a valid TCP port between 1 and 65535.')
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
      toast.success('Custom domain mapped')
    } catch (err) {
      toast.error(extractError(err))
    } finally { setIsBusy(false) }
  }

  const handleAuthToggle = async () => {
    if (!session) return
    const next = !session.requireAuth
    setIsBusy(true)
    try {
      const result = await updateClientAuth(session.id, next)
      setSession(cur => cur ? { ...cur, requireAuth: result.requireAuth } : cur)
      if (selectedTunnelId) {
        const selected = persistentTunnels.find(tunnel => tunnel.id === selectedTunnelId)
        if (selected) {
          const updated = await updateTunnel(session.id, { ...selected, requireAuth: result.requireAuth })
          setPersistentTunnels(current => current.map(tunnel => tunnel.id === updated.id ? updated : tunnel))
        }
      }
      setGauthEnabled(result.gauthEnabled)
      toast.success(result.requireAuth ? 'Auth wall enabled' : 'Auth wall disabled')
    } catch (err) {
      toast.error(extractError(err))
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
    toast.success(`Selected ${tunnel.subdomain}.${ROOT_DOMAIN}.`)
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
      toast.success(`Starting ${updated.subdomain}.${ROOT_DOMAIN}...`)
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
      if (tunnel.id === selectedTunnelId) {
        tunnelClose.current = null
        setConnState('idle')
        setConnectedAt(null)
      }
      toast.success(`${tunnel.subdomain}.${ROOT_DOMAIN} is stopped.`)
    } catch (err) {
      toast.error(extractError(err))
    } finally {
      setIsBusy(false)
    }
  }

  const removePersistentTunnel = async (tunnel: PersistentTunnel) => {
    if (!session || !window.confirm(`Delete ${tunnel.subdomain}.${ROOT_DOMAIN}?`)) return
    setIsBusy(true)
    try {
      await deleteTunnel(session.id, tunnel.id)
      if (tunnel.id === selectedTunnelId) {
        tunnelClose.current = null
        setConnState('idle')
        setSelectedTunnelId(null)
      }
      disconnectShare(tunnel)
      removeFolder(tunnel.id)
      setPersistentTunnels(current => current.filter(item => item.id !== tunnel.id))
      toast.success('Share deleted.')
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
      toast.success(paused ? `${tunnel.subdomain} is paused. Visitors see a paused page.` : `${tunnel.subdomain} is live again.`)
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
      const availability = await checkSubdomainAvailability(name)
      if (!availability.available) {
        toast.error('That address is already taken or reserved.')
        return
      }
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
      })
      if (request.folder) setFolder(created.id, request.folder)
      setPersistentTunnels(current => [...current, created])
      setShowNewTunnel(false)
      await startPersistentTunnel(created, request.folder)
    } catch (err) {
      toast.error(extractError(err))
    }
  }

  const exportTunnelConfiguration = () => {
    if (!session) return
    const payload = JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), tunnels: persistentTunnels.map(({ subdomain, customDomain, port, requireAuth, pathRoutes }) => ({ subdomain, customDomain, port, requireAuth, pathRoutes })) }, null, 2)
    const url = URL.createObjectURL(new Blob([payload], { type: 'application/json' }))
    const link = document.createElement('a')
    link.href = url
    link.download = 'kexoz-tunnels.json'
    link.click()
    URL.revokeObjectURL(url)
    toast.success('Tunnel configuration exported')
  }

  const importTunnelConfiguration = async (file: File) => {
    if (!session) return
    setIsBusy(true)
    try {
      const parsed = JSON.parse(await file.text()) as { tunnels?: Array<Partial<PersistentTunnel>> }
      const imported = parsed.tunnels ?? []
      if (!imported.length) throw new Error('The file does not contain any tunnels.')
      const created = [] as PersistentTunnel[]
      for (const tunnel of imported) {
        const port = tunnel.port
        if (!tunnel.subdomain || typeof port !== 'number' || !Number.isInteger(port) || port < 1 || port > 65535) continue
        created.push(await createTunnel(session.id, {
          subdomain: tunnel.subdomain,
          customDomain: tunnel.customDomain ?? '',
          port,
          requireAuth: tunnel.requireAuth === true,
          pathRoutes: tunnel.pathRoutes?.length ? tunnel.pathRoutes : [{ path: '/', port }],
        }))
      }
      if (!created.length) throw new Error('No valid tunnel configurations were found.')
      setPersistentTunnels(current => [...current, ...created])
      toast.success(`Imported ${created.length} tunnels.`)
    } catch (err) {
      toast.error(extractError(err))
    } finally {
      setIsBusy(false)
    }
  }

  const handleCopyUrl = async () => {
    if (!publicUrl) return
    try {
      await navigator.clipboard.writeText(publicUrl)
      setCopyFeedback('copied')
      toast.success('URL copied')
    } catch {
      setCopyFeedback('failed')
    }
    window.setTimeout(() => setCopyFeedback('idle'), 1800)
  }

  const handleCopyClientId = async () => {
    if (!session) return
    try {
      await navigator.clipboard.writeText(session.id)
      toast.success('Client ID copied to clipboard')
    } catch {
      toast.error('Could not copy Client ID')
    }
  }

  const handleLogout = () => {
    clearClientId()
    window.location.reload()
  }

  const handleUpgrade = async (planId?: string) => {
    if (!session) return
    if (!planId) {
      // Show plan picker modal first
      setShowUpgradeModal(true)
      return
    }
    try {
      const checkoutUrl = await createCheckoutSession(session.id, planId)
      window.open(checkoutUrl, '_blank', 'noopener,noreferrer')
      setShowUpgradeModal(false)
    } catch (err) {
      toast.error(extractError(err))
    }
  }

  return (
    <>
      <Toaster position="bottom-right" toastOptions={TOAST_OPTIONS} />
      {showUpgradeModal && session && (
        <UpgradeModal
          currentPlan={session.plan}
          clientId={session.id}
          onClose={() => setShowUpgradeModal(false)}
          onCheckout={(planId) => handleUpgrade(planId)}
        />
      )}
      <AppShell>
        {step === 'dashboard' && session && (
          <Sidebar
            activePage={activePage}
            onNavigate={setActivePage}
            requestCount={totalRequests}
            theme={theme}
            onToggleTheme={toggleTheme}
            ownerEmail={session.ownerEmail}
            onLogin={() => void startGoogleVerify()}
            onLogout={handleLogout}
            collapsed={sidebarCollapsed}
            onToggleCollapse={() => setSidebarCollapsed(v => {
              const next = !v
              window.localStorage.setItem('kexoz-sidebar-collapsed', String(next))
              return next
            })}
          />
        )}

        {step === 'loading' && (
          <LoadingScreen
            statusMessage={statusMessage}
            errorMessage={""}
            onRetry={() => void bootstrapClient()}
            theme={theme}
            onToggleTheme={toggleTheme}
          />
        )}

        {step === 'gate' && session && (
          <GateScreen
            onLogin={() => void startGoogleVerify()}
            onSkip={skipGate}
            verifying={verifying}
            gauthEnabled={gauthEnabled}
            theme={theme}
            onToggleTheme={toggleTheme}
          />
        )}

        {step === 'subdomain' && session && (
          <SubdomainScreen
            session={session}
            subdomainInput={subdomainInput}
            setSubdomainInput={setSubdomainInput}
            onSubmit={handleSubdomainSubmit}
            isBusy={isBusy}
            theme={theme}
            onToggleTheme={toggleTheme}
          />
        )}

        {step === 'dashboard' && session && (
          <>
            {activePage === 'dashboard' && (
              <>
                {tierOf(session) === 'anonymous' && gauthEnabled && (
                  <div style={{ padding: '0 28px', paddingTop: 16 }}>
                    <VerifyBanner onVerify={() => void startGoogleVerify()} verifying={verifying} />
                  </div>
                )}
                <DashboardPage
                session={session}
                connState={connState}
                portInput={portInput}
                setPortInput={setPortInput}
                onPortSubmit={handlePortSubmit}
                gauthEnabled={gauthEnabled}
                onAuthToggle={handleAuthToggle}
                isBusy={isBusy}
                totalRequests={totalRequests}
                onCopyUrl={handleCopyUrl}
                copyFeedback={copyFeedback}
                requestLog={requestLog}
                bytesIn={bytesIn}
                bytesOut={bytesOut}
                dailyUsage={dailyUsage}
                portListening={portListening}
                uptimeSeconds={uptimeSeconds}
                showNewTunnel={showNewTunnel}
                onOpenNewTunnel={() => setShowNewTunnel(true)}
                onCloseNewTunnel={() => setShowNewTunnel(false)}
                onCreateTunnel={createShare}
                tunnelType={persistentTunnels.find(t => t.id === selectedTunnelId)?.tunnelType}
                folderPath={selectedTunnelId ? folderShares[selectedTunnelId]?.root : undefined}
              />
              </>
            )}

            {activePage === 'tunnels' && (
              <TunnelsPage
                session={session}
                connState={connState}
                portInput={portInput}
                setPortInput={setPortInput}
                onPortSubmit={handlePortSubmit}
                isBusy={isBusy}
                onCopyUrl={handleCopyUrl}
                copyFeedback={copyFeedback}
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
                onNewTunnel={() => {
                  setActivePage('dashboard')
                  setShowNewTunnel(true)
                }}
                tunnelNames={tunnelNames}
                onRenameTunnel={onRenameTunnel}
              />
            )}

            {activePage === 'requests' && (
              <RequestsPage
                requestLog={requestLog}
                onClear={clearLog}
                retention={retention}
                onRetentionChange={setRetention}
                publicUrl={publicUrl}
              />
            )}

            {activePage === 'domains' && (
              <DomainsPage
                session={session}
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
                autoStart={autoStart}
                onToggleAutoStart={() => setAutoStart(!autoStart)}
                session={session}
                onVerify={() => void startGoogleVerify()}
                onUpgrade={() => void handleUpgrade()}
                onCopyClientId={() => void handleCopyClientId()}
                tunnels={persistentTunnels}
                onExportTunnels={exportTunnelConfiguration}
                onImportTunnels={(file) => void importTunnelConfiguration(file)}
                verifying={verifying}
                gauthEnabled={gauthEnabled}
                portInput={portInput}
              />
            )}

            <Toaster position="bottom-right" toastOptions={TOAST_OPTIONS} />
          </>
        )}
      </AppShell>
    </>
  )
}
