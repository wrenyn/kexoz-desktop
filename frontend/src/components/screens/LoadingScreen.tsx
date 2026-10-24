import Logo from '../ui/Logo'
import { RefreshCw, Sun, Moon } from 'lucide-react'

type LoadingScreenProps = {
  statusMessage: string
  errorMessage: string
  onRetry: () => void
  theme: 'light' | 'dark'
  onToggleTheme: () => void
}

export default function LoadingScreen({ statusMessage, errorMessage, onRetry, theme, onToggleTheme }: LoadingScreenProps) {
  const isError = Boolean(errorMessage)

  return (
    <div className="ps-splash">
      {/* Theme toggle */}
      <button
        type="button"
        className="ps-splash-theme"
        onClick={onToggleTheme}
        title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
        style={{ display: 'flex', alignItems: 'center', gap: 6 }}
      >
        {theme === 'dark'
          ? <><Sun size={12} /> Light</>
          : <><Moon size={12} /> Dark</>
        }
      </button>

      <div className={`ps-splash-inner ${isError ? 'has-error' : ''}`}>
        {/* Logo with glow halo */}
        <div className="ps-splash-logo-wrap">
          <Logo className="ps-splash-logo" />
          {!isError && <span className="ps-splash-ring" />}
        </div>

        {/* Brand name */}
        <div className="ps-splash-brand">Kexoz</div>

        {isError ? (
          <>
            <div style={{ animation: 'ps-splash-fade 0.4s var(--ease-out) 0.1s both' }}>
              <span
                className="ps-badge ps-badge-red"
                style={{ padding: '7px 14px', fontSize: 12.5, fontWeight: 500, letterSpacing: 0 }}
              >
                {errorMessage}
              </span>
            </div>
            <button
              type="button"
              className="ps-btn ps-btn-primary"
              onClick={onRetry}
              style={{ marginTop: 4, gap: 8, animation: 'ps-splash-fade 0.4s var(--ease-out) 0.2s both' }}
            >
              <RefreshCw size={13} />
              Try again
            </button>
            <p style={{
              fontSize: 11,
              color: 'var(--text-soft)',
              animation: 'ps-splash-fade 0.4s var(--ease-out) 0.3s both',
              maxWidth: 260,
            }}>
              Make sure you have an internet connection, then retry.
            </p>
          </>
        ) : (
          <>
            <p className="ps-splash-status">{statusMessage}</p>
            {/* Three-dot loading indicator */}
            <div style={{ display: 'flex', gap: 6, marginTop: 4, animation: 'ps-splash-fade 0.4s var(--ease-out) 0.35s both' }}>
              {[0, 1, 2].map(i => (
                <span
                  key={i}
                  style={{
                    width: 5,
                    height: 5,
                    borderRadius: '50%',
                    background: 'var(--text-soft)',
                    animation: `dotPulse 1.4s ease-in-out ${i * 0.2}s infinite`,
                  }}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
