import { type FormEvent } from 'react'
import { ROOT_DOMAIN } from '../../lib/api'
import ThemeToggle from '../ui/ThemeToggle'
import Logo from '../ui/Logo'
import { useState, useEffect } from 'react'
import { checkSubdomainAvailability } from '../../lib/api'

type SubdomainScreenProps = {
  subdomainInput: string
  setSubdomainInput: (v: string) => void
  onSubmit: (e: FormEvent<HTMLFormElement>) => void
  isBusy: boolean
  theme: 'light' | 'dark'
  onToggleTheme: () => void
}

export default function SubdomainScreen({
  subdomainInput, setSubdomainInput, onSubmit, isBusy, theme, onToggleTheme
}: SubdomainScreenProps) {
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

  const AvailabilityBadge = () => {
    const status =
      isChecking ? { text: 'Checking…', color: 'var(--text-soft)' } :
      availability === 'available' ? { text: 'Available', color: 'var(--green)' } :
      availability === 'taken' ? { text: 'Already taken', color: 'var(--red)' } :
      availability === 'reserved' ? { text: 'Reserved name', color: 'var(--red)' } :
      null
    if (!status) return null
    return <span style={{ marginLeft: 8, fontSize: 11.5, fontWeight: 600, color: status.color }}>{status.text}</span>
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
          <p className="ps-onboard-text animate-gate-line-2" style={{ marginBottom: 20 }}>
            Your permanent address. It can&apos;t be changed later.
          </p>

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
              {isBusy ? 'Claiming…' : 'Claim subdomain'}
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
