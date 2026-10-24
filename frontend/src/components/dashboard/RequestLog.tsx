import { type MutableRefObject } from 'react'
import { motion } from 'motion/react'
import type { RequestLogEntry } from '../../lib/api'
import { formatTime, statusClass } from '../../lib/utils'

type RequestLogProps = {
  requestLog: RequestLogEntry[]
  logBodyRef: MutableRefObject<HTMLDivElement | null>
  onClear: () => void
}

export default function RequestLog({ requestLog, logBodyRef, onClear }: RequestLogProps) {
  return (
    <div className="request-log-panel">
      <div className="request-log-header">
        <p className="request-log-title">
          Request Log
          <span className="log-live-badge">
            <span className="log-live-dot" />
            LIVE
          </span>
        </p>
        <button type="button" className="clear-log-btn" onClick={onClear}>
          Clear
        </button>
      </div>
      <div className="request-log-body" ref={logBodyRef}>
        {requestLog.length === 0 ? (
          <p className="log-empty">Waiting for requests… your tunnel is ready.</p>
        ) : (
          requestLog.slice().reverse().map(entry => (
            <motion.div
              key={entry.id}
              className="log-entry"
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
            >
              <span className={`log-method ${entry.method}`}>{entry.method}</span>
              <span className={`log-status ${statusClass(entry.status)}`}>
                {entry.status ?? '—'}
              </span>
              <span className="log-path" title={entry.path}>{entry.path}</span>
              <span className="log-duration">
                {entry.durationMs !== null ? `${entry.durationMs}ms` : ''}
              </span>
              <span className="log-time">{formatTime(entry.timestamp)}</span>
            </motion.div>
          ))
        )}
      </div>
    </div>
  )
}
