import { ShieldCheck } from 'lucide-react'

type VerifyBannerProps = {
  onVerify: () => void
  verifying: boolean
}

export default function VerifyBanner({ onVerify, verifying }: VerifyBannerProps) {
  return (
    <div
      className="ps-card animate-fade-up"
      style={{
        padding: '12px 18px',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        borderColor: 'var(--green-border)',
        background: 'linear-gradient(180deg, var(--green-dim), transparent)',
      }}
    >
      <ShieldCheck size={18} style={{ color: 'var(--green)', flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 650 }}>
          You&apos;re on guest bandwidth (100 MB)
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
          Verify with Google to unlock 1 GB free — no password needed.
        </div>
      </div>
      <button
        type="button"
        className="ps-btn ps-btn-primary ps-btn-sm"
        onClick={onVerify}
        disabled={verifying}
        style={{ flexShrink: 0 }}
      >
        {verifying ? 'Check browser…' : 'Verify · 1 GB'}
      </button>
    </div>
  )
}
