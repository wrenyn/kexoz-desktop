import type { CSSProperties } from 'react'

type SkeletonProps = { width?: string; height?: string; borderRadius?: string; style?: CSSProperties }

export default function Skeleton({ width = '100%', height = '16px', borderRadius = '8px', style }: SkeletonProps) {
  return (
    <div
      style={{
        width, height, borderRadius,
        background: 'linear-gradient(90deg, var(--bg-surface) 25%, var(--bg-elevated) 50%, var(--bg-surface) 75%)',
        backgroundSize: '200% 100%',
        animation: 'shimmer 1.5s infinite',
        ...style,
      }}
    />
  )
}
