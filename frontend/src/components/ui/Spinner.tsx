/** Compact brand spinner — use on buttons and inline waits. */
export default function Spinner({ size = 16, className = '' }: { size?: number; className?: string }) {
  return (
    <span
      className={`ps-spinner ${className}`}
      style={{ width: size, height: size }}
      role="status"
      aria-label="Loading"
    />
  )
}
