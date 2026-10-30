import { useCallback, useEffect, useState } from 'react'
import type { ConnectionState } from '../lib/api'

export type ConnectionEvent = {
  key: string
  state: ConnectionState
  reason?: string
  at: number
}

export type ShareHealth = {
  state: ConnectionState
  /** When the current connected stretch began. */
  connectedSince: number | null
  /** Milliseconds connected and total milliseconds watched, for uptime. */
  upMs: number
  watchedMs: number
  reconnects: number
  lastReason: string
  lastDropAt: number | null
}

const STORAGE_KEY = 'kexoz-connection-history'
const HEARTBEAT_KEY = 'kexoz-connection-heartbeat'
const MAX_EVENTS = 300

/** Closes out shares that were still connected when the app last quit, at the last time it was seen running. */
function load(): ConnectionEvent[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    const parsed = raw ? JSON.parse(raw) as ConnectionEvent[] : []
    const events = Array.isArray(parsed) ? parsed.slice(-MAX_EVENTS) : []
    const lastSeen = Number(window.localStorage.getItem(HEARTBEAT_KEY)) || 0
    const latest = new Map<string, ConnectionEvent>()
    for (const event of events) latest.set(event.key, event)
    for (const [key, event] of latest) {
      if (event.state !== 'idle') events.push({ key, state: 'idle', at: Math.max(event.at, lastSeen) })
    }
    return events.slice(-MAX_EVENTS)
  } catch {
    return []
  }
}

/** Keeps a short, persistent log of connection changes per share. */
export function useConnectionHistory() {
  const [events, setEvents] = useState<ConnectionEvent[]>(load)

  useEffect(() => {
    const beat = () => window.localStorage.setItem(HEARTBEAT_KEY, String(Date.now()))
    beat()
    const id = window.setInterval(beat, 30000)
    return () => window.clearInterval(id)
  }, [])

  const record = useCallback((key: string, state: ConnectionState | null, reason?: string) => {
    setEvents(prev => {
      const next: ConnectionEvent = { key, state: state ?? 'idle', reason, at: Date.now() }
      const last = [...prev].reverse().find(event => event.key === key)
      if (last && last.state === next.state && last.reason === next.reason) return prev
      const updated = [...prev, next].slice(-MAX_EVENTS)
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(updated))
      return updated
    })
  }, [])

  const clear = useCallback(() => {
    window.localStorage.removeItem(STORAGE_KEY)
    setEvents([])
  }, [])

  return { events, record, clear }
}

/** Summarises the last 24 hours of events for one share. */
export function shareHealth(events: ConnectionEvent[], key: string, now: number): ShareHealth {
  const windowStart = now - 24 * 60 * 60 * 1000
  const mine = events.filter(event => event.key === key)
  let state: ConnectionState = 'idle'
  let since = 0
  let connectedSince: number | null = null
  let upMs = 0
  let watchedMs = 0
  let reconnects = 0
  let lastReason = ''
  let lastDropAt: number | null = null
  let wasConnected = false

  const close = (until: number) => {
    if (state === 'idle' || !since) return
    const from = Math.max(since, windowStart)
    if (until <= from) return
    watchedMs += until - from
    if (state === 'connected') upMs += until - from
  }

  for (const event of mine) {
    close(event.at)
    if (event.state === 'disconnected') {
      if (event.reason) lastReason = event.reason
      lastDropAt = event.at
    }
    if (event.state === 'connected') {
      if (wasConnected && event.at >= windowStart) reconnects += 1
      wasConnected = true
      connectedSince = event.at
    } else {
      connectedSince = null
    }
    if (event.state === 'idle') wasConnected = false
    state = event.state
    since = event.at
  }
  close(now)
  return { state, connectedSince, upMs, watchedMs, reconnects, lastReason, lastDropAt }
}
