import { Moon, Sun } from 'lucide-react'
import type { ConnectionState, FlowStep } from '../../lib/api'
import StatusDot from './StatusDot'

type TopbarProps = {
  step: FlowStep
  publicUrl: string
  connState: ConnectionState
  connLabel: string
  totalRequests: number
  statusMessage: string
  theme: 'light' | 'dark'
  copyFeedback: 'idle' | 'copied' | 'failed'
  onCopyUrl: () => void
  onToggleTheme: () => void
}

export default function Topbar({
  step, publicUrl, connState, connLabel, totalRequests, statusMessage, theme, copyFeedback, onCopyUrl, onToggleTheme
}: TopbarProps) {
  return (
    <header className="console-topbar">
      <div className="brand-area">
        <span className="brand-mark" aria-hidden="true">PS</span>
        <div>
          <p className="brand-title">Kexoz Tunnel</p>
          <p className="brand-subtitle">Expose localhost through managed subdomains</p>
        </div>
      </div>

      {step === 'dashboard' && publicUrl ? (
        <div className="url-chip-wrap">
          <div className="url-chip" aria-live="polite">
            <span className="url-chip-label">Public URL</span>
            <strong>{publicUrl}</strong>
          </div>
          <button id="copy-url-btn" type="button" className="copy-btn" onClick={onCopyUrl}>
            {/* Announced to screen readers when the copy result changes. */}
            <span aria-live="polite">
              {copyFeedback === 'copied' ? '✓ Copied'
                : copyFeedback === 'failed' ? '✗ Failed'
                : 'Copy URL'}
            </span>
          </button>
        </div>
      ) : (
        <div className="connection-status">
          <StatusDot state="loading" />
          <span className="connection-label">{statusMessage}</span>
        </div>
      )}

      <div className="topbar-right">
        {step === 'dashboard' && (
          <>
            <div className="connection-status">
              <StatusDot state={connState} />
              <span className="connection-label">{connLabel}</span>
            </div>
            <div className="request-counter">
              <span>{totalRequests}</span> req{totalRequests !== 1 ? 's' : ''}
            </div>
          </>
        )}
        <button type="button" className="theme-toggle" onClick={onToggleTheme}
          aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
          aria-pressed={theme === 'light'}
          title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}>
          {theme === 'dark' ? <Sun size={14} aria-hidden="true" /> : <Moon size={14} aria-hidden="true" />}
          {theme === 'dark' ? 'Light' : 'Dark'}
        </button>
      </div>
    </header>
  )
}
