import { useCallback, useEffect, useState } from 'react'
import { toast } from 'react-hot-toast'
import type { PersistentTunnel } from '../../lib/api'
import { readMobileMeta, readMobileSessionId } from '../../lib/mobilePreview'
import { shareUrl } from '../../lib/shares'
import TrustNote from '../ui/TrustNote'

type MobileLive = {
  id: string
  serial: string
  port: number
  remoteControlActive: boolean
  viewerCount?: number
  info?: { model?: string; androidVersion?: string; width?: number; height?: number }
}

export default function MobileShareControls({
  tunnel,
  isBusy,
  onRevoke,
}: {
  tunnel: PersistentTunnel
  isBusy: boolean
  onRevoke?: () => void
}) {
  const meta = readMobileMeta(tunnel.id)
  const [live, setLive] = useState<MobileLive | null>(null)
  const [diag, setDiag] = useState<Array<{ id: string; ok: boolean; detail: string }>>([])
  const [checking, setChecking] = useState(false)

  const refresh = useCallback(async () => {
    const sessions = await window.kexoz?.mobileSessions?.()
    const sid = readMobileSessionId(tunnel.id)
    const match = (sessions || []).find(s => s.id === sid) || (sessions || []).find(s => s.port === tunnel.port)
    setLive(match ? {
      id: match.id,
      serial: match.serial,
      port: match.port,
      remoteControlActive: match.remoteControlActive,
      viewerCount: (match as MobileLive).viewerCount,
      info: (match as MobileLive).info,
    } : null)
  }, [tunnel.id, tunnel.port])

  useEffect(() => {
    void refresh()
    const unsub = window.kexoz?.onMobileState?.(() => { void refresh() })
    const timer = window.setInterval(() => { void refresh() }, 3000)
    return () => {
      unsub?.()
      window.clearInterval(timer)
    }
  }, [refresh])

  const runDiagnose = async () => {
    setChecking(true)
    try {
      const result = await window.kexoz?.adbDiagnose?.()
      setDiag(result?.rows || [])
      if (!result?.rows?.length) toast.error('Could not run Android diagnostics.')
    } finally {
      setChecking(false)
    }
  }

  const revoke = async () => {
    const sid = live?.id || readMobileSessionId(tunnel.id)
    if (!sid) {
      toast.error('No active Mobile Preview session.')
      return
    }
    const result = await window.kexoz?.mobilePreviewRevoke?.(sid)
    if (result?.ok) {
      toast.success('Remote control revoked')
      onRevoke?.()
      void refresh()
    } else {
      toast.error(result?.message || 'Could not revoke control')
    }
  }

  const model = live?.info?.model || meta?.model || meta?.serial || 'Android device'
  const version = live?.info?.androidVersion || meta?.androidVersion
  const size = (live?.info?.width && live?.info?.height)
    ? `${live.info.width}×${live.info.height}`
    : (meta?.width && meta?.height ? `${meta.width}×${meta.height}` : '')

  return (
    <div className="ps-mobile-controls">
      <div className="ps-mobile-status-card">
        <div className="ps-mobile-status-row">
          <span className={`ps-badge ${tunnel.active ? 'ps-badge-green' : 'ps-badge-gray'}`}>
            {tunnel.active ? (live ? 'Device linked' : 'Share online') : 'Stopped'}
          </span>
          {live?.remoteControlActive ? (
            <span className="ps-badge ps-badge-red ps-badge-live-pulse">REMOTE CONTROL ACTIVE</span>
          ) : (
            <span className="ps-badge ps-badge-gray">No remote controller</span>
          )}
        </div>
        <p className="ps-mobile-device-title">{model}</p>
        <p className="ps-panel-hint">
          {[version && `Android ${version}`, size, meta?.emulator ? 'Emulator' : meta?.serial ? 'USB / device' : null]
            .filter(Boolean)
            .join(' · ') || 'Bound on this computer via ADB'}
        </p>
        {typeof live?.viewerCount === 'number' && tunnel.active && (
          <p className="ps-panel-hint">{live.viewerCount} viewer{live.viewerCount === 1 ? '' : 's'} connected</p>
        )}
      </div>

      <div className="ps-mobile-actions">
        <a className="ps-btn ps-btn-secondary ps-btn-sm" href={shareUrl(tunnel)} target="_blank" rel="noreferrer">
          Open preview
        </a>
        <button
          type="button"
          className="ps-btn ps-btn-danger ps-btn-sm"
          disabled={isBusy || !live?.remoteControlActive}
          onClick={() => void revoke()}
        >
          Revoke control
        </button>
        <button type="button" className="ps-btn ps-btn-ghost ps-btn-sm" disabled={checking} onClick={() => void runDiagnose()}>
          {checking ? 'Checking…' : 'Diagnose ADB'}
        </button>
      </div>

      {diag.length > 0 && (
        <ul className="ps-mobile-diag">
          {diag.map(row => (
            <li key={row.id} className={row.ok ? 'ok' : 'bad'}>
              <strong>{row.id}</strong> — {row.detail}
            </li>
          ))}
        </ul>
      )}

      <TrustNote title="What reviewers can reach" tone="ok">
        They see the device screen and, if you allow control, taps and typing on that device only.
        <strong> ADB, your files, and other apps stay on this computer.</strong> Revoke control or stop the share anytime.
      </TrustNote>
    </div>
  )
}
