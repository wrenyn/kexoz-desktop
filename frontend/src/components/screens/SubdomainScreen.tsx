import { useEffect, useState, type FormEvent } from 'react'
import { ROOT_DOMAIN, checkSubdomainAvailability } from '../../lib/api'
import Logo from '../ui/Logo'
import Spinner from '../ui/Spinner'
import TrustNote from '../ui/TrustNote'

type SubdomainScreenProps = {
  subdomainInput: string
  setSubdomainInput: (v: string) => void
  onSubmit: (e: FormEvent<HTMLFormElement>) => void
  isBusy: boolean
}

export default function SubdomainScreen({
  subdomainInput, setSubdomainInput, onSubmit, isBusy
}: SubdomainScreenProps) {
  const [isChecking, setIsChecking] = useState(false)
  const [checkVersion, setCheckVersion] = useState(0)
  const [availability, setAvailability] = useState<'idle' | 'available' | 'taken' | 'reserved' | 'error'>('idle')

  // Debounced real-time availability check
  useEffect(() => {
    const value = subdomainInput.trim().toLowerCase()
    if (value.length < 3 || value.length > 32 || !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(value)) {
      setAvailability('idle')
      setIsChecking(false)
      return
    }
    let active = true
    setAvailability('idle')
    setIsChecking(true)
    const timer = setTimeout(async () => {
      try {
        const res = await checkSubdomainAvailability(value)
        if (active) setAvailability(res.reserved ? 'reserved' : res.available ? 'available' : 'taken')
      } catch {
        if (active) setAvailability('error')
      } finally {
        if (active) setIsChecking(false)
      }
    }, 380)
    return () => { active = false; clearTimeout(timer) }
  }, [subdomainInput, checkVersion])

  const AvailabilityBadge = () => {
    if (isChecking) {
      return (
        <span className="ps-avail-pill is-wait">
          <Spinner size={11} /> Checking
        </span>
      )
    }
    if (availability === 'available') return <span className="ps-avail-pill is-ok">Available</span>
    if (availability === 'taken') return <span className="ps-avail-pill is-bad">Taken</span>
    if (availability === 'reserved') return <span className="ps-avail-pill is-bad">Not available</span>
    if (availability === 'error') return <span className="ps-avail-pill is-bad">Couldn’t check — try again</span>
    return null
  }

  const inputBorderColor =
    availability === 'available' ? 'var(--green)' :
    (availability === 'taken' || availability === 'reserved' || availability === 'error') ? 'var(--red)' :
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
      </div>

      {/* Body */}
      <div className="ps-onboard-body">
        <div className="ps-onboard-card animate-gate-card" style={{ maxWidth: 460 }}>

          <h1 className="animate-gate-line-2" style={{ marginBottom: 6 }}>
            Pick your first address
          </h1>
          <p className="ps-onboard-text animate-gate-line-2" style={{ marginBottom: 20 }}>
            People open your shares here. You can add more addresses later.
          </p>

          <form className="ps-onboard-form animate-gate-line-4" onSubmit={onSubmit}>
            <div className="ps-input-wrap">
              <label className="ps-label" htmlFor="subdomain" style={{ display: 'flex', alignItems: 'center' }}>
                Address
                <span role="status"><AvailabilityBadge /></span>
              </label>
              <div
                className="ps-input-group"
                style={{
                  borderColor: inputBorderColor,
                  boxShadow: inputBorderColor ? `0 0 0 2px color-mix(in srgb, ${inputBorderColor} 15%, transparent)` : undefined,
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
                  maxLength={32}
                  aria-describedby="subdomain-help"
                  aria-invalid={availability === 'taken' || availability === 'reserved'}
                  disabled={isBusy}
                  autoFocus
                />
                <span className="ps-input-suffix">.{ROOT_DOMAIN}</span>
              </div>
              {subdomainInput.length > 0 && subdomainInput.length < 3 && (
                <p style={{ fontSize: 11, color: 'var(--text-soft)', marginTop: 2 }}>
                  Use at least 3 characters
                </p>
              )}
            </div>

            <p id="subdomain-help" className="field-help">Use 3–32 lowercase letters, numbers, or hyphens. Start and end with a letter or number.</p>
            {availability === 'error' && <button type="button" className="ps-btn ps-btn-secondary" onClick={() => setCheckVersion(value => value + 1)}>Check availability again</button>}
            <button
              className={`ps-btn ps-btn-primary ps-btn-lg ${isBusy ? 'is-loading' : ''}`}
              type="submit"
              disabled={!canSubmit}
              style={{ borderRadius: 10, transition: 'all 0.2s ease' }}
            >
              {isBusy ? <><Spinner size={14} /> Saving</> : 'Continue'}
            </button>
          </form>

          <TrustNote title="Your public address" tone="ok">
            Reviewers open this link in a browser. You can add more addresses later from Domains.
          </TrustNote>
        </div>
      </div>
    </div>
  )
}
