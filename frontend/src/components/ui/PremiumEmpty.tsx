import type { ReactNode } from 'react'

/** Structured empty state for cards and panels — title, reason, optional CTA. */
export default function PremiumEmpty({
  title,
  children,
  action,
  compact = false,
}: {
  title: string
  children?: ReactNode
  action?: ReactNode
  compact?: boolean
}) {
  return (
    <div className={`ps-premium-empty ${compact ? 'is-compact' : ''}`}>
      {!compact ? <span className="ps-premium-empty-mark" aria-hidden="true" /> : null}
      <span className="ps-premium-empty-title">{title}</span>
      {children ? <p className="ps-premium-empty-body">{children}</p> : null}
      {action ? <div className="ps-premium-empty-action">{action}</div> : null}
    </div>
  )
}
