import { useEffect, useState } from 'react'
import axios from 'axios'
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis } from 'recharts'
import { fetchShareAnalytics, upgradeUrl, type AnalyticsRange, type PersistentTunnel, type ShareAnalytics } from '../../lib/api'
import { extractError, formatBytes } from '../../lib/utils'

const RANGES: { id: AnalyticsRange; label: string; days: number }[] = [
  { id: '24h', label: '24 hours', days: 1 },
  { id: '7d', label: '7 days', days: 7 },
  { id: '30d', label: '30 days', days: 30 },
  { id: '90d', label: '90 days', days: 90 },
]

const STATUS_ROWS = [
  { key: 's2xx', label: 'Success (2xx)', color: 'var(--green)' },
  { key: 's3xx', label: 'Redirect (3xx)', color: 'var(--blue)' },
  { key: 's4xx', label: 'Client error (4xx)', color: 'var(--yellow)' },
  { key: 's5xx', label: 'Server error (5xx)', color: 'var(--red)' },
] as const

type Failure = { message: string; maxDays?: number }

function bucketLabel(value: string, bucket: ShareAnalytics['bucket']): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return bucket === 'hour'
    ? date.toLocaleTimeString(undefined, { hour: 'numeric' })
    : date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function duration(from: string, to?: string): string {
  const ms = (to ? new Date(to).getTime() : Date.now()) - new Date(from).getTime()
  const minutes = Math.max(0, Math.round(ms / 60000))
  if (minutes < 60) return `${minutes} min`
  const hours = Math.floor(minutes / 60)
  if (hours < 48) return `${hours} h ${minutes % 60} min`
  return `${Math.floor(hours / 24)} days`
}

/** Traffic, errors and response times for one share, kept by the server. */
export default function ShareAnalyticsSection({ clientId, tunnel }: { clientId: string; tunnel: PersistentTunnel }) {
  const [range, setRange] = useState<AnalyticsRange>('24h')
  const [data, setData] = useState<ShareAnalytics | null>(null)
  const [failure, setFailure] = useState<Failure | null>(null)
  const [loadedKey, setLoadedKey] = useState('')
  const key = `${tunnel.id}:${range}`
  const loading = loadedKey !== key

  useEffect(() => {
    let alive = true
    fetchShareAnalytics(clientId, tunnel.id, range)
      .then(result => { if (alive) { setData(result); setFailure(null) } })
      .catch(err => {
        if (!alive) return
        const body = axios.isAxiosError(err) ? err.response?.data as { upgradeRequired?: boolean; maxDays?: number } | undefined : undefined
        setFailure({ message: extractError(err), maxDays: body?.upgradeRequired ? body.maxDays : undefined })
      })
      .finally(() => { if (alive) setLoadedKey(`${tunnel.id}:${range}`) })
    return () => { alive = false }
  }, [clientId, tunnel.id, range])

  const maxDays = data?.maxDays ?? failure?.maxDays
  const totals = data?.totals
  const chart = (data?.series ?? []).map(point => ({ label: bucketLabel(point.t, data!.bucket), requests: point.requests, errors: point.errors, avgMs: point.avgMs }))
  const errors = totals ? totals.s4xx + totals.s5xx : 0

  return (
    <section className="ps-panel-section ps-analytics">
      <div className="ps-analytics-head">
        <h3 className="ps-panel-section-title">Traffic</h3>
        <select className="ps-select" value={range} onChange={event => setRange(event.target.value as AnalyticsRange)} aria-label="Time range">
          {RANGES.map(option => (
            <option key={option.id} value={option.id}>
              {option.label}{maxDays !== undefined && option.days > maxDays ? ' (upgrade)' : ''}
            </option>
          ))}
        </select>
      </div>

      {failure ? (
        <p className="ps-panel-hint">
          {failure.message}
          {failure.maxDays !== undefined && (
            <> <a href={upgradeUrl(clientId, 'pro')} target="_blank" rel="noreferrer">See plans</a></>
          )}
        </p>
      ) : !data || !totals ? (
        <p className="ps-panel-hint">{loading ? 'Loading…' : 'No traffic recorded yet.'}</p>
      ) : (
        <>
          <div className="ps-analytics-stats">
            <div><span>Requests</span><strong>{totals.requests.toLocaleString()}</strong></div>
            <div><span>Errors</span><strong className={errors > 0 ? 'ps-analytics-bad' : ''}>{totals.requests ? `${Math.round((errors / totals.requests) * 1000) / 10}%` : '—'}</strong></div>
            <div><span>Typical</span><strong>{totals.requests ? `${totals.p50Ms} ms` : '—'}</strong></div>
            <div><span>Slowest 5%</span><strong>{totals.requests ? `${totals.p95Ms} ms` : '—'}</strong></div>
          </div>
          <p className="ps-panel-hint">
            {formatBytes(totals.bytesIn)} in · {formatBytes(totals.bytesOut)} out · online {Math.round(data.onlinePct)}% of this time
            {data.live ? ' · running now' : ''}
          </p>

          {totals.requests > 0 && (
            <div className="ps-analytics-chart">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chart} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
                  <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: 'var(--text-soft)', fontSize: 10 }} minTickGap={18} />
                  <Tooltip
                    cursor={{ fill: 'var(--bg-hover)' }}
                    contentStyle={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 6, fontSize: 12 }}
                    itemStyle={{ color: 'var(--text)' }}
                    labelStyle={{ color: 'var(--text-soft)', marginBottom: 4 }}
                    formatter={(value: unknown, name: unknown) => [Number(value).toLocaleString(), name === 'errors' ? 'Errors' : 'Requests']}
                  />
                  <Bar dataKey="requests" stackId="r" fill="var(--green)" isAnimationActive={false} />
                  <Bar dataKey="errors" stackId="e" fill="var(--red)" isAnimationActive={false} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {totals.requests > 0 && (
            <div className="ps-status-rows">
              {STATUS_ROWS.map(row => totals[row.key] > 0 && (
                <div key={row.key} className="ps-status-row">
                  <span className="ps-status-row-label">{row.label}</span>
                  <div className="ps-status-row-bar">
                    <div style={{ width: `${(totals[row.key] / totals.requests) * 100}%`, background: row.color }} />
                  </div>
                  <span className="ps-status-row-count">{totals[row.key].toLocaleString()}</span>
                </div>
              ))}
            </div>
          )}

          {data.paths.length > 0 && (
            <table className="ps-analytics-paths">
              <thead>
                <tr><th>Path</th><th>Requests</th><th>Errors</th><th>Avg</th></tr>
              </thead>
              <tbody>
                {data.paths.slice(0, 8).map(path => (
                  <tr key={path.path}>
                    <td title={path.path}>{path.path}</td>
                    <td>{path.requests.toLocaleString()}</td>
                    <td className={path.errors > 0 ? 'ps-analytics-bad' : ''}>{path.errors.toLocaleString()}</td>
                    <td>{path.avgMs} ms</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {data.connections.length > 0 && (
            <details className="ps-analytics-connections">
              <summary>Connection history</summary>
              <ul>
                {data.connections.slice(0, 10).map(item => (
                  <li key={item.connectedAt}>
                    <span>{new Date(item.connectedAt).toLocaleString()}</span>
                    <span className="ps-panel-hint">{item.disconnectedAt ? `for ${duration(item.connectedAt, item.disconnectedAt)}` : `connected, ${duration(item.connectedAt)} so far`}</span>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </>
      )}
    </section>
  )
}
