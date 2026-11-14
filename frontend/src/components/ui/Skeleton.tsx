/** Shimmer placeholder for content that is still loading. */
export default function Skeleton({
  width = '100%',
  height = 14,
  radius,
  className = '',
}: {
  width?: number | string
  height?: number | string
  radius?: number | string
  className?: string
}) {
  return (
    <span
      className={`ps-skeleton ${className}`}
      style={{ width, height, borderRadius: radius }}
      aria-hidden="true"
    />
  )
}
