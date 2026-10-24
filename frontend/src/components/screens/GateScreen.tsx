import Logo from '../ui/Logo'

type GateScreenProps = {
  onLogin: () => void
  onSkip: () => void
  verifying: boolean
  theme: 'light' | 'dark'
}

const GoogleMark = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }} aria-hidden="true">
    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05" />
    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
  </svg>
)

export default function GateScreen({ onLogin, onSkip, verifying, theme }: GateScreenProps) {
  return (
    <div className="ps-splash">
      <div aria-hidden="true" style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        background: theme === 'dark'
          ? 'radial-gradient(ellipse 60% 50% at 50% 40%, rgba(198,243,107,0.06) 0%, transparent 70%)'
          : 'radial-gradient(ellipse 60% 50% at 50% 40%, rgba(63,98,18,0.05) 0%, transparent 70%)',
      }} />

      <div className="animate-gate-card ps-gate-card">
        <div className="animate-gate-line-1" style={{ marginBottom: 22 }}>
          <Logo style={{ width: 56, height: 56, boxShadow: '0 0 0 1px var(--border)' }} />
        </div>

        <h1 className="animate-gate-line-2 ps-gate-title">Welcome to Kexoz</h1>
        <p className="animate-gate-line-2 ps-gate-text">
          {verifying
            ? 'Finish signing in with Google in your browser. This window updates on its own.'
            : 'Share apps, terminals and folders from this computer with a link.'}
        </p>

        <div className="animate-gate-line-3 ps-gate-actions">
          <button type="button" className="ps-gate-google" onClick={onLogin} disabled={verifying}>
            {verifying ? <><span className="ps-gate-spinner" aria-hidden="true" /> Waiting for Google…</> : <><GoogleMark /> Continue with Google</>}
          </button>
          <p className="ps-gate-note">Free 1 GB of bandwidth, and private links protected by Google sign-in.</p>

          <button type="button" className="ps-btn ps-btn-ghost ps-gate-guest" onClick={onSkip}>
            {verifying ? 'Cancel and continue as guest' : 'Continue as guest'}
          </button>
          {!verifying && <p className="ps-gate-note">100 MB of bandwidth. Private links need a password.</p>}
        </div>
      </div>
    </div>
  )
}
