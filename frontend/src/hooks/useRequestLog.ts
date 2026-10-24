import { useState, useCallback, useRef } from 'react'
import type { RequestLogEntry } from '../lib/api'

export function useRequestLog() {
  const [requestLog, setRequestLog] = useState<RequestLogEntry[]>([])
  const [totalRequests, setTotalRequests] = useState(0)
  const [retention, setRetentionState] = useState(() => {
    const saved = Number(window.localStorage.getItem('kexoz-request-retention'))
    return saved === 50 || saved === 100 || saved === 250 ? saved : 100
  })
  const retentionRef = useRef(retention)
  const logBodyRef = useRef<HTMLDivElement | null>(null)

  const addLogEntry = useCallback((entry: RequestLogEntry) => {
    setRequestLog(prev => {
      const next = [...prev]
      const existingIdx = next.findIndex(e => e.id === entry.id)
      if (existingIdx !== -1) {
        next[existingIdx] = { ...next[existingIdx], ...entry }
      } else {
        next.push(entry)
        setTotalRequests(n => n + 1)
      }
      return next.length > retentionRef.current ? next.slice(-retentionRef.current) : next
    })
  }, [])

  const setRetention = useCallback((value: number) => {
    const next = value === 50 || value === 100 || value === 250 ? value : 100
    setRetentionState(next)
    retentionRef.current = next
    window.localStorage.setItem('kexoz-request-retention', String(next))
    setRequestLog(current => current.slice(-next))
  }, [])

  const clearLog = useCallback(() => {
    setRequestLog([])
    setTotalRequests(0)
  }, [])

  return { requestLog, totalRequests, retention, setRetention, logBodyRef, addLogEntry, clearLog }
}
