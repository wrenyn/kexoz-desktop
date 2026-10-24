import Logo from '../ui/Logo'
import { ArrowRight, Sun, Moon, Shield, Zap } from 'lucide-react'

type GateScreenProps = {
  onLogin: () => void
  onSkip: () => void
  verifying: boolean
  gauthEnabled: boolean
  theme: 'light' | 'dark'
  onToggleTheme: () => void
}

/* ---------- Google G SVG ---------- */
const GoogleIcon = ({ greyscale }: { greyscale: boolean }) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      fill={greyscale ? 'currentColor' : '#4285F4'} />
    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      fill={greyscale ? 'currentColor' : '#34A853'} />
    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"
      fill={greyscale ? 'currentColor' : '#FBBC05'} />
    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      fill={greyscale ? 'currentColor' : '#EA4335'} />
  </svg>
)

/* ---------- Spinner ---------- */
const Spinner = () => (
  <span style={{
    width: 14, height: 14, flexShrink: 0,
    border: '2px solid var(--border-bright)',
    borderTopColor: 'var(--text-accent)',
    borderRadius: '50%',
    display: 'inline-block',
    animation: 'spin 0.75s linear infinite',
  }} />
)

export default function GateScreen({ onLogin, onSkip, verifying, gauthEnabled, theme, onToggleTheme }: GateScreenProps) {
  return (
    <div className="ps-splash">

      {/* Theme toggle */}
      <button
        type="button"
        className="ps-splash-theme"
        onClick={onToggleTheme}
        title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
      >
        {theme === 'dark' ? <Sun size={12} /> : <Moon size={12} />}
        {theme === 'dark' ? 'Light' : 'Dark'}
      </button>

      {/* Ambient radial glow — purely decorative */}
      <div aria-hidden="true" style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        background: theme === 'dark'
          ? 'radial-gradient(ellipse 60% 50% at 50% 40%, rgba(198,243,107,0.06) 0%, transparent 70%)'
          : 'radial-gradient(ellipse 60% 50% at 50% 40%, rgba(63,98,18,0.05) 0%, transparent 70%)',
      }} />

      {/* Card */}
      <div className="animate-gate-card" style={{
        position: 'relative',
        width: '100%',
        maxWidth: 380,
        margin: '0 20px',
        background: 'var(--bg-surface)',
        border: '1px solid var(--border)',
        borderRadius: 20,
        padding: '36px 32px 28px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        boxShadow: theme === 'dark'
          ? '0 32px 72px rgba(0,0,0,0.45), 0 0 0 1px rgba(233,237,230,0.04) inset'
          : '0 20px 48px rgba(32,35,34,0.08)',
      }}>

        {/* Logo — clean square icon, no spinner */}
        <div className="animate-gate-line-1" style={{ marginBottom: 22 }}>
          <Logo style={{ width: 60, height: 60, boxShadow: '0 0 0 1px var(--border)' }} />
        </div>

        {/* Heading */}
        <h1 className="animate-gate-line-2" style={{
          fontSize: 20, fontWeight: 700, color: 'var(--text-strong)',
          letterSpacing: '-0.03em', textAlign: 'center', lineHeight: 1.2,
          marginBottom: 8,
        }}>
          Welcome to Kexoz
        </h1>

        {/* Subtext */}
        <p className="animate-gate-line-2" style={{
          fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.6,
          textAlign: 'center', marginBottom: 26, maxWidth: 280,
        }}>
          {verifying
            ? 'Complete Google sign-in in your browser, then come back here.'
            : 'Share your local apps, terminals and files securely.'
          }
        </p>

        {/* ── BUTTONS ── */}
        <div className="animate-gate-line-3" style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%' }}>

          {/* Google — always visible */}
          <button
            type="button"
            onClick={!verifying ? onLogin : undefined}
            disabled={verifying}
            style={{
              width: '100%', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 9,
              padding: '10px 20px', fontSize: 13.5, fontWeight: 600,
              fontFamily: 'var(--sans-font)', letterSpacing: '-0.01em',
              borderRadius: 11, border: '1px solid var(--border-bright)',
              background: 'var(--bg-elevated)', color: 'var(--text)',
              transition: 'all 0.15s ease',
            }}
            onMouseOver={e => { (e.currentTarget).style.background = 'var(--bg-hover)'; (e.currentTarget).style.borderColor = 'var(--border-focus)'; }}
            onMouseOut={e => { (e.currentTarget).style.background = 'var(--bg-elevated)'; (e.currentTarget).style.borderColor = 'var(--border-bright)'; }}
          >
            {verifying
              ? <><Spinner /> Waiting for Google…</>
              : <>
                  <GoogleIcon greyscale={false} />
                  Continue with Google
                </>
            }
          </button>

          {/* OR divider */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '1px 0' }}>
            <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
            <span style={{ fontSize: 11, color: 'var(--text-soft)', fontWeight: 500, userSelect: 'none' }}>or</span>
            <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
          </div>

          {/* Guest — primary CTA */}
          <button
            type="button"
            onClick={!verifying ? onSkip : undefined}
            disabled={verifying}
            className="ps-btn ps-btn-primary"
            style={{
              width: '100%', padding: '10px 20px', fontSize: 13.5,
              borderRadius: 11, gap: 8, justifyContent: 'center',
              letterSpacing: '-0.01em',
            }}
          >
            <ArrowRight size={15} />
            Use a random ID (guest mode)
          </button>
        </div>

        {/* Perks row */}
        <div className="animate-gate-line-4" style={{
          display: 'grid', gridTemplateColumns: '1fr 1fr',
          gap: 7, marginTop: 16, width: '100%',
        }}>
          {[
            { icon: <Zap size={11} />, label: gauthEnabled ? '1 GB with Google' : '100 MB to start' },
            { icon: <Shield size={11} />, label: 'E2E encryption' },
            { icon: <ArrowRight size={11} />, label: 'Manage billing in browser' },
          ].map(({ icon, label }) => (
            <div key={label} style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '6px 10px', borderRadius: 8,
              background: 'var(--bg-elevated)', border: '1px solid var(--border)',
              fontSize: 11.5, color: 'var(--text-muted)', fontWeight: 500,
            }}>
              <span style={{ color: 'var(--text-soft)', flexShrink: 0 }}>{icon}</span>
              {label}
            </div>
          ))}
        </div>

        {/* Footer */}
        <p className="animate-gate-line-5" style={{
          fontSize: 11, color: 'var(--text-soft)', textAlign: 'center',
          marginTop: 14, lineHeight: 1.5,
        }}>
          Upgrade to Pro for 100 GB bandwidth & custom domains.
        </p>
      </div>
    </div>
  )
}
