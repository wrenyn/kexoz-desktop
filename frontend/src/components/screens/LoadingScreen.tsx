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
        </div>

        <div className="ps-splash-brand">Kexoz</div>

        {isError ? (
          <>
            <p className="ps-splash-status" role="alert" style={{ color: 'var(--text)' }}>{errorMessage}</p>
            <p style={{ fontSize: 12, color: 'var(--text-soft)', maxWidth: 280, textAlign: 'center', margin: 0 }}>
              Check your internet connection, then try again.
            </p>
            <button type="button" className="ps-btn ps-btn-primary" onClick={onRetry} style={{ marginTop: 6 }}>
              Try again
            </button>
          </>
        ) : (
          <>
            <p className="ps-splash-status" role="status">{statusMessage || 'Starting Kexoz…'}</p>
            <div className="ps-splash-progress" aria-hidden="true"><span /></div>
          </>
        )}
      </div>
    </div>
  )
}
