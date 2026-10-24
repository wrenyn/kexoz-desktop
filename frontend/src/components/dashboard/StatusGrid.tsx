import { motion } from 'motion/react'
import type { ClientSession, ConnectionState } from '../../lib/api'
import { ROOT_DOMAIN } from '../../lib/api'

type StatusGridProps = { connState: ConnectionState; session: ClientSession }

export default function StatusGrid({ connState, session }: StatusGridProps) {
  const items = [
    { label: 'Tunnel status', value: connState === 'connected' ? '● Live' : '○ Offline', className: connState === 'connected' ? 'online' : 'offline' },
    { label: 'Subdomain', value: `${session.subdomain}.${ROOT_DOMAIN}`, className: '' },
    { label: 'Active port', value: session.port ? String(session.port) : '—', className: '' },
    { label: 'Custom domain', value: session.customDomain || '—', className: '' },
  ]

  return (
    <div className="status-grid">
      {items.map((item, i) => (
        <motion.article
          key={item.label}
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.08, duration: 0.35, ease: 'easeOut' }}
        >
          <p className="status-label">{item.label}</p>
          <p className={`status-value ${item.className}`}>{item.value}</p>
        </motion.article>
      ))}
    </div>
  )
}
