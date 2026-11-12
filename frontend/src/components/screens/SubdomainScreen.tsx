import { useEffect, useState, type FormEvent } from 'react'
import { ROOT_DOMAIN, checkSubdomainAvailability } from '../../lib/api'
import Logo from '../ui/Logo'
import Spinner from '../ui/Spinner'

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

  const statusText = (() => {
    if (isChecking) return 'Checking…'
    if (availability === 'available') return 'Available'
    if (availability === 'taken') return 'Taken — try another'
    if (availability === 'reserved') return 'Reserved — try another'
    if (availability === 'error') return 'Couldn’t check'
    if (subdomainInput.length > 0 && subdomainInput.length < 3) return 'At least 3 characters'
    return ''
  })()

  const statusTone =
    availability === 'available' ? 'is-ok' :
    availability === 'taken' || availability === 'reserved' || availability === 'error' ? 'is-bad' :
    ''

  const inputBorderColor =
    availability === 'available' ? 'var(--green)' :
    (availability === 'taken' || availability === 'reserved' || availability === 'error') ? 'var(--red)' :
    undefined

  const canSubmit = !isBusy && !isChecking && availability === 'available'

  return (
    <div className="ps-onboard">
      <div className="ps-onboard-bar">
        <div className="ps-sidebar-brand" style={{ padding: 0, border: 'none', margin: 0 }}>
          <div className="ps-brand-icon">
            <Logo style={{ width: '100%', height: '100%' }} />
          </div>
          <div className="ps-brand-name">Kexoz</div>
        </div>
      </div>

      <div className="ps-onboard-body">
        <div className="ps-onboard-card animate-gate-card">
          <h1 className="animate-gate-line-2">Your address</h1>
          <p className="ps-onboard-description">Choose a memorable address for your first share. You can reserve more addresses later in Domains.</p>

          <form className="ps-onboard-form animate-gate-line-4" onSubmit={onSubmit}>
            <div className="ps-input-wrap">
              <div
                className="ps-input-group"
                style={{
                  borderColor: inputBorderColor,
                  boxShadow: inputBorderColor ? `0 0 0 2px color-mix(in srgb, ${inputBorderColor} 15%, transparent)` : undefined,
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
                  aria-label="Address"
                  aria-describedby="subdomain-status"
                  aria-invalid={availability === 'taken' || availability === 'reserved'}
                  disabled={isBusy}
                  autoFocus
                />
                <span className="ps-input-suffix">.{ROOT_DOMAIN}</span>
              </div>
              <p id="subdomain-status" className={`ps-field-status ${statusTone}`} role="status">
                {isChecking ? <><Spinner size={11} /> {statusText}</> : statusText}
              </p>
            </div>

            {availability === 'error' && (
              <button type="button" className="ps-btn ps-btn-secondary" onClick={() => setCheckVersion(v => v + 1)}>
                Check again
              </button>
            )}
            <button
              className={`ps-btn ps-btn-primary ps-btn-lg ${isBusy ? 'is-loading' : ''}`}
              type="submit"
              disabled={!canSubmit}
            >
              {isBusy ? <><Spinner size={14} /> Saving</> : 'Continue'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
