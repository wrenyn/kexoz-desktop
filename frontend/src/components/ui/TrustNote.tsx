import type { ReactNode } from 'react'

/** Short, purposeful trust copy. Only render when it answers a user fear. */
export default function TrustNote({
  title,
  children,
  tone = 'default',
}: {
  title?: string
  children: ReactNode
  tone?: 'default' | 'warn' | 'ok'
}) {
  return (
    <aside className={`ps-trust-note ps-trust-note-${tone}`} role="note">
      {title ? <strong className="ps-trust-note-title">{title}</strong> : null}
      <div className="ps-trust-note-body">{children}</div>
    </aside>
  )
}
