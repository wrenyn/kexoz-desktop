import type { ReactNode } from 'react'
import Spinner from './Spinner'
import Skeleton from './Skeleton'

/** Centered premium loading state for page/panel content. */
export default function LoadingBlock({
  label = 'Loading',
  rows = 3,
  compact = false,
}: {
  label?: string
  rows?: number
  compact?: boolean
}) {
  return (
    <div className={`ps-loading-block ${compact ? 'is-compact' : ''}`} aria-busy="true" aria-label={label}>
      <div className="ps-loading-block-head">
        <Spinner size={compact ? 16 : 20} />
        <span className="ps-loading-block-label">{label}</span>
      </div>
      <div className="ps-loading-block-skel">
        {Array.from({ length: rows }, (_, i) => (
          <Skeleton key={i} height={compact ? 10 : 12} width={i === rows - 1 ? '62%' : '100%'} />
        ))}
      </div>
    </div>
  )
}

export function PageSkeleton({ cards = 4 }: { cards?: number }) {
  return (
    <div className="ps-page-skeleton" aria-busy="true" aria-label="Loading page">
      <div className="ps-page-skeleton-stats">
        {Array.from({ length: cards }, (_, i) => (
          <div key={i} className="ps-page-skeleton-card">
            <Skeleton height={10} width="40%" />
            <Skeleton height={22} width="55%" />
            <Skeleton height={10} width="70%" />
          </div>
        ))}
      </div>
    </div>
  )
}

export function InlineLoad({ children = 'Working…' }: { children?: ReactNode }) {
  return (
    <span className="ps-inline-load">
      <Spinner size={13} />
      <span>{children}</span>
    </span>
  )
}
