import Logo from '../ui/Logo'

type LoadingScreenProps = {
  statusMessage: string
  errorMessage: string
  onRetry: () => void
}

export default function LoadingScreen({ statusMessage, errorMessage, onRetry }: LoadingScreenProps) {
  const isError = Boolean(errorMessage)

  return (
    <div className="ps-splash">
      <div className={`ps-splash-inner ${isError ? 'has-error' : ''}`}>
        <div className="ps-splash-logo-wrap">
          <Logo className="ps-splash-logo" />
          {!isError && <span className="ps-splash-ring" />}
        </div>

        <div className="ps-splash-brand">Kexoz</div>

        {isError ? (
          <>
            <p className="ps-splash-status" style={{ color: 'var(--text)' }}>{errorMessage}</p>
            <p style={{ fontSize: 12, color: 'var(--text-soft)', maxWidth: 280, textAlign: 'center', margin: 0 }}>
              Check your internet connection, then try again.
            </p>
            <button type="button" className="ps-btn ps-btn-primary" onClick={onRetry} style={{ marginTop: 6 }}>
              Try again
            </button>
          </>
        ) : (
          <>
            <p className="ps-splash-status">{statusMessage}</p>
            <div style={{ display: 'flex', gap: 6, marginTop: 4, animation: 'ps-splash-fade 0.4s var(--ease-out) 0.35s both' }} aria-hidden="true">
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
