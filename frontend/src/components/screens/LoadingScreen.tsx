import { useEffect, useState } from 'react'
import Logo from '../ui/Logo'

type Props = { statusMessage: string; errorMessage: string; onRetry: () => void }

function ConnectionProgress({ message }: { message: string }) {
  const [takingLonger, setTakingLonger] = useState(false)
  useEffect(() => {
    const timer = window.setTimeout(() => setTakingLonger(true), 8000)
    return () => window.clearTimeout(timer)
  }, [])
  return (
    <>
      <p className="ps-splash-status" role="status">{message || 'Starting Kexoz…'}</p>
      <div className="ps-splash-progress is-indeterminate" role="progressbar" aria-label={message || 'Starting Kexoz'}><span /></div>
      {takingLonger && <p className="ps-splash-hint" role="status">This is taking longer than usual. We’re still trying to connect.</p>}
    </>
  )
}

export default function LoadingScreen({ statusMessage, errorMessage, onRetry }: Props) {

  return (
    <div className="ps-splash">
      <div className={`ps-splash-inner ${errorMessage ? 'has-error' : ''}`}>
        <div className="ps-splash-logo-wrap"><Logo className="ps-splash-logo" /></div>
        <div className="ps-splash-brand">Kexoz</div>
        {errorMessage ? (
          <>
            <p className="ps-splash-status" role="alert">{errorMessage}</p>
            <p className="ps-splash-hint">Check your internet connection, then try again.</p>
            <button type="button" className="ps-btn ps-btn-primary ps-splash-retry" onClick={onRetry}>Try again</button>
          </>
        ) : (
          <ConnectionProgress key={statusMessage} message={statusMessage} />
        )}
      </div>
    </div>
  )
}
