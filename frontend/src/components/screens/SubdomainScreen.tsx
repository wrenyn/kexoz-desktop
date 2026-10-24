import { type FormEvent } from 'react'
import type { ClientSession } from '../../lib/api'
import { ROOT_DOMAIN } from '../../lib/api'
import ThemeToggle from '../ui/ThemeToggle'
import Logo from '../ui/Logo'
import { Copy, Check, CheckCircle2, XCircle, Loader2 } from 'lucide-react'
import { useState, useEffect } from 'react'
import { toast } from 'react-hot-toast'
import { checkSubdomainAvailability } from '../../lib/api'

type SubdomainScreenProps = {
  session: ClientSession
  subdomainInput: string
  setSubdomainInput: (v: string) => void
  onSubmit: (e: FormEvent<HTMLFormElement>) => void
  isBusy: boolean
  theme: 'light' | 'dark'
  onToggleTheme: () => void
}

export default function SubdomainScreen({
  session, subdomainInput, setSubdomainInput, onSubmit, isBusy, theme, onToggleTheme
}: SubdomainScreenProps) {
  const [copied, setCopied] = useState(false)
  const [isChecking, setIsChecking] = useState(false)
  const [availability, setAvailability] = useState<'idle' | 'available' | 'taken' | 'reserved'>('idle')

  // Debounced real-time availability check
  useEffect(() => {
    const value = subdomainInput.trim().toLowerCase()
    if (value.length < 3 || value.length > 32 || !/^[a-z0-9]/.test(value)) {
      setAvailability('idle')
      setIsChecking(false)
      return
    }
    setIsChecking(true)
    const timer = setTimeout(async () => {
      try {
        const res = await checkSubdomainAvailability(value)
        setAvailability(res.reserved ? 'reserved' : res.available ? 'available' : 'taken')
      } catch {
        setAvailability('idle')
      } finally {
        setIsChecking(false)
      }
    }, 380)
    return () => clearTimeout(timer)
  }, [subdomainInput])

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(session.id)
      setCopied(true)
      toast.success('Client ID copied')
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error('Failed to copy')
    }
  }

  // Availability indicator
  const AvailabilityBadge = () => {
    if (isChecking) return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginLeft: 8, fontSize: 11.5, color: 'var(--text-soft)' }}>
        <Loader2 size={11} style={{ animation: 'spin 0.8s linear infinite' }} /> Checking…
      </span>
    )
    if (availability === 'available') return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginLeft: 8, fontSize: 11.5, color: 'var(--green)', fontWeight: 600 }}>
        <CheckCircle2 size={11} /> Available
      </span>
    )
    if (availability === 'taken') return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginLeft: 8, fontSize: 11.5, color: 'var(--red)', fontWeight: 600 }}>
        <XCircle size={11} /> Already taken
      </span>
    )
    if (availability === 'reserved') return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginLeft: 8, fontSize: 11.5, color: 'var(--yellow)', fontWeight: 600 }}>
        <XCircle size={11} /> Reserved name
      </span>
    )
    return null
  }

  const inputBorderColor =
    availability === 'available' ? 'var(--green)' :
    (availability === 'taken' || availability === 'reserved') ? 'var(--red)' :
    undefined

  const canSubmit = !isBusy && !isChecking && availability === 'available'

  return (
    <div className="ps-onboard">
      {/* Top bar */}
      <div className="ps-onboard-bar">
        <div className="ps-sidebar-brand" style={{ padding: 0, border: 'none', margin: 0 }}>
          <div className="ps-brand-icon">
            <Logo style={{ width: '100%', height: '100%' }} />
          </div>
          <div className="ps-brand-name">Kexoz</div>
        </div>
        <ThemeToggle theme={theme} onToggle={onToggleTheme} compact />
      </div>

      {/* Body */}
      <div className="ps-onboard-body">
        <div className="ps-onboard-card animate-gate-card" style={{ maxWidth: 460 }}>

          {/* Title */}
          <h1 className="animate-gate-line-2" style={{ marginBottom: 6 }}>
            Choose your public URL
          </h1>
          <p className="ps-onboard-text animate-gate-line-2" style={{ marginBottom: 12 }}>
            This becomes your permanent address on the internet.
          </p>
          <div className="animate-gate-line-2" style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: 9,
            padding: '10px 12px',
            borderRadius: 8,
            background: 'rgba(251, 191, 36, 0.08)',
            border: '1px solid rgba(251, 191, 36, 0.28)',
            marginBottom: 18,
          }}>
            <span style={{ fontSize: 14, flexShrink: 0, marginTop: 1 }}>⚠️</span>
            <p style={{ fontSize: 11.5, color: 'var(--yellow)', margin: 0, lineHeight: 1.55, fontWeight: 500 }}>
              <strong>This subdomain is permanent.</strong> Once claimed, it cannot be changed, deleted, or transferred. Choose carefully.
            </p>
          </div>

          {/* Client ID row */}
          <div className="animate-gate-line-3" style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '7px 10px',
            borderRadius: 8,
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border)',
            marginBottom: 20,
          }}>
            <span style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--text-soft)', textTransform: 'uppercase', letterSpacing: '0.06em', flexShrink: 0 }}>
              Device ID
            </span>
            <span style={{ fontFamily: 'var(--mono-font)', fontSize: 11, color: 'var(--text-muted)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {session.id}
            </span>
            <button
              type="button"
              onClick={handleCopy}
              className="ps-btn-icon"
              title="Copy Device ID"
              style={{
                padding: 5,
                color: copied ? 'var(--green)' : 'var(--text-soft)',
                border: 'none',
                background: 'none',
                transition: 'color 0.2s ease',
                flexShrink: 0,
              }}
            >
              {copied ? <Check size={13} /> : <Copy size={13} />}
            </button>
          </div>

          {/* Form */}
          <form className="ps-onboard-form animate-gate-line-4" onSubmit={onSubmit}>
            <div className="ps-input-wrap">
              <label className="ps-label" htmlFor="subdomain" style={{ display: 'flex', alignItems: 'center' }}>
                Subdomain
                <AvailabilityBadge />
              </label>
              <div
                className="ps-input-group"
                style={{
                  borderColor: inputBorderColor,
                  boxShadow: inputBorderColor ? `0 0 0 2px ${inputBorderColor}22` : undefined,
                  transition: 'border-color 0.2s ease, box-shadow 0.2s ease',
                }}
              >
                <input
                  id="subdomain"
                  className="ps-input ps-input-mono"
                  value={subdomainInput}
                  onChange={e => setSubdomainInput(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                  placeholder="my-app"
                  autoComplete="off"
                  spellCheck={false}
                  disabled={isBusy}
                  autoFocus
                />
                <span className="ps-input-suffix">.{ROOT_DOMAIN}</span>
              </div>
              {subdomainInput.length > 0 && subdomainInput.length < 3 && (
                <p style={{ fontSize: 11, color: 'var(--text-soft)', marginTop: 2 }}>
                  At least 3 characters required
                </p>
              )}
            </div>

            <button
              className="ps-btn ps-btn-primary ps-btn-lg"
              type="submit"
              disabled={!canSubmit}
              style={{ borderRadius: 10, transition: 'all 0.2s ease' }}
            >
              {isBusy ? (
                <><Loader2 size={14} style={{ animation: 'spin 0.8s linear infinite' }} /> Claiming…</>
              ) : (
                'Claim this subdomain →'
              )}
            </button>
          </form>

          {/* Hint text */}
          <p className="animate-gate-line-5" style={{ fontSize: 11.5, color: 'var(--text-soft)', marginTop: 16, lineHeight: 1.5, textAlign: 'center' }}>
            Your tunnel will be live at <span style={{ fontFamily: 'var(--mono-font)', color: 'var(--text-muted)' }}>
              {subdomainInput ? `${subdomainInput}.${ROOT_DOMAIN}` : `<subdomain>.${ROOT_DOMAIN}`}
            </span>
          </p>
        </div>
      </div>
    </div>
  )
}
