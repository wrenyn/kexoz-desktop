import { useEffect, useState } from 'react'
import { CheckCircle2, Shield, X, Rocket } from 'lucide-react'
import { API_BASE_URL } from '../../lib/api'

type Plan = {
  id: string
  name: string
  priceCents: number
  bandwidthLimit: number
  features: string[]
  active: boolean
  discountPercent?: number
}

type Props = {
  currentPlan: string
  clientId: string
  onClose: () => void
  onCheckout: (planId: string) => Promise<void>
}

function formatBytes(v: number) {
  if (v < 1024 * 1024 * 1024) return `${(v / 1024 / 1024).toFixed(0)} MB`
  return `${(v / 1024 / 1024 / 1024).toFixed(0)} GB`
}

// Fallback plans if server catalog is unavailable
const FALLBACK_PLANS: Plan[] = [
  {
    id: 'pro',
    name: 'Pro',
    priceCents: 900,
    bandwidthLimit: 10 * 1024 * 1024 * 1024,
    features: [
      '10 GB / month bandwidth',
      'Custom domains',
      'Google auth wall',
      'Priority tunnels',
      'Request inspector (unlimited)',
    ],
    active: true,
  },
  {
    id: 'pro_plus',
    name: 'Pro+',
    priceCents: 1900,
    bandwidthLimit: 50 * 1024 * 1024 * 1024,
    features: [
      '50 GB / month bandwidth',
      'Everything in Pro',
      'White-label auth branding',
      'Team seats',
      'Priority support',
    ],
    active: true,
  },
]

export default function UpgradeModal({ currentPlan, onClose, onCheckout }: Props) {
  const [plans, setPlans] = useState<Plan[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null)

  useEffect(() => {
    fetch(`${API_BASE_URL}/admin/plans`)
      .then(r => r.json() as Promise<{ plans?: Plan[] }>)
      .then(d => {
        const paid = (d.plans ?? []).filter(p => p.active && p.id !== 'free')
        setPlans(paid.length > 0 ? paid : FALLBACK_PLANS)
      })
      .catch(() => setPlans(FALLBACK_PLANS))
      .finally(() => setLoading(false))
  }, [])

  const handleCheckout = async (planId: string) => {
    setSelectedPlanId(planId)
    setBusy(true)
    try {
      await onCheckout(planId)
    } finally {
      setBusy(false)
      setSelectedPlanId(null)
    }
  }

  return (
    <div className="ps-modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="ps-modal upgrade-modal">
        <div className="ps-modal-header">
          <div>
            <div className="ps-modal-title" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Rocket size={18} style={{ color: 'var(--accent)' }} />
              Upgrade plan
            </div>
            <div className="ps-tunnel-card-subtitle">Month-to-month. Cancel anytime.</div>
          </div>
          <button className="ps-btn ps-btn-ghost ps-btn-sm" onClick={onClose} style={{ padding: 4 }}>
            <X size={16} />
          </button>
        </div>

        <div className="upgrade-modal-body">
          {loading ? (
            <div className="upgrade-modal-loading">
              <span style={{ color: 'var(--text-soft)' }}>Loading plans…</span>
            </div>
          ) : (
            <div className="upgrade-plans-grid">
              {plans.map(plan => {
                const isCurrent = plan.id === currentPlan
                const price = plan.discountPercent && plan.discountPercent > 0
                  ? Math.round(plan.priceCents * (100 - plan.discountPercent) / 100)
                  : plan.priceCents
                return (
                  <div key={plan.id} className={`upgrade-plan-card${isCurrent ? ' current' : ''}${plan.id === 'pro' ? ' featured' : ''}`}>
                    {plan.id === 'pro' && !isCurrent && (
                      <div className="upgrade-plan-badge">Most Popular</div>
                    )}
                    {isCurrent && (
                      <div className="upgrade-plan-badge current-badge">Current Plan</div>
                    )}
                    <h3 className="upgrade-plan-name">{plan.name}</h3>
                    <div className="upgrade-plan-price">
                      {plan.priceCents === 0 ? 'Free' : `$${(price / 100).toFixed(0)}`}
                      {plan.priceCents > 0 && <span>/mo</span>}
                    </div>
                    {plan.discountPercent && plan.discountPercent > 0 && (
                      <div style={{ fontSize: 11, color: 'var(--green)', fontWeight: 600, marginTop: -4, marginBottom: 4 }}>
                        {plan.discountPercent}% off — was ${(plan.priceCents / 100).toFixed(0)}/mo
                      </div>
                    )}
                    <div className="upgrade-plan-bw">{formatBytes(plan.bandwidthLimit)} / month</div>
                    <ul className="upgrade-plan-features">
                      {plan.features.map(f => (
                        <li key={f}>
                          <CheckCircle2 size={13} style={{ color: 'var(--green)', marginRight: 6, flexShrink: 0 }} />
                          {f}
                        </li>
                      ))}
                    </ul>
                    {isCurrent ? (
                      <div className="upgrade-plan-current">
                        <Shield size={14} style={{ color: 'var(--green)', marginRight: 6 }} /> Active plan
                      </div>
                    ) : (
                      <button
                        className={`ps-btn ps-btn-primary ps-btn-sm upgrade-plan-btn${plan.id === 'pro' ? ' upgrade-plan-btn-featured' : ''}`}
                        onClick={() => void handleCheckout(plan.id)}
                        disabled={busy}
                      >
                        {busy && selectedPlanId === plan.id ? 'Loading…' : `Upgrade to ${plan.name}`}
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          )}
          <p className="upgrade-footer-note">
            Cancel anytime from your{' '}
            <a href="https://kexoz.dev/account" target="_blank" rel="noreferrer">account portal</a>.
          </p>
        </div>
      </div>
    </div>
  )
}
