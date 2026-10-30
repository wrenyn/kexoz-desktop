import { useMemo } from 'react'
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis } from 'recharts'
import type { ClientSession, PersistentTunnel, RequestLogEntry, UsagePoint } from '../../lib/api'
import { TIER_LABELS, tierOf, upgradeUrl } from '../../lib/api'
import { shareStatus } from '../../lib/shares'
import { isNoiseRequestPath } from '../../lib/tunnel'
import { formatBytes } from '../../lib/utils'
import type { ConnectionEvent } from '../../hooks/useConnectionHistory'
import ConnectionPanel from '../dashboard/ConnectionPanel'

type Props = {
  session: ClientSession
  tunnels: PersistentTunnel[]
  totalRequests: number
  requestLog: RequestLogEntry[]
  bytesIn: number
  bytesOut: number
  dailyUsage: UsagePoint[]
  connectionEvents: ConnectionEvent[]
  onNewShare: () => void
  onViewRequests: () => void
  onViewShares: () => void
}

const STATUS_GROUPS = [
  { key: '2', label: 'Success (2xx)', color: 'var(--green)' },
  { key: '3', label: 'Redirect (3xx)', color: 'var(--blue)' },
  { key: '4', label: 'Client error (4xx)', color: 'var(--yellow)' },
  { key: '5', label: 'Server error (5xx)', color: 'var(--red)' },
] as const

function shortDate(period: string): string {
  const date = new Date(period)
  return Number.isNaN(date.getTime()) ? period : date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export default function DashboardPage({
  session, tunnels, totalRequests, requestLog, bytesIn, bytesOut, dailyUsage, connectionEvents,
  onNewShare, onViewRequests, onViewShares,
}: Props) {
  const tier = tierOf(session)
  const bwPct = session.bandwidthLimit > 0 ? Math.min(100, (session.bandwidthUsed / session.bandwidthLimit) * 100) : 0
  const liveShares = tunnels.filter(t => shareStatus(t) === 'active').length

  const stats = useMemo(() => {
    const visible = requestLog.filter(entry => !isNoiseRequestPath(entry.path))
    const durations = visible.map(entry => entry.durationMs).filter((ms): ms is number => ms != null)
    const avgMs = durations.length ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : null

    const groups = STATUS_GROUPS.map(group => ({
      ...group,
      count: visible.filter(entry => String(entry.status ?? '').startsWith(group.key)).length,
    }))
    const failed = visible.filter(entry => !entry.status).length

    const pathCounts = new Map<string, number>()
    for (const entry of visible) {
      const path = entry.path.split('?')[0] || '/'
      pathCounts.set(path, (pathCounts.get(path) ?? 0) + 1)
    }
    const topPaths = [...pathCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5)

    return { total: visible.length, avgMs, groups, failed, topPaths }
  }, [requestLog])

  const chartData = dailyUsage.length > 0
    ? [...dailyUsage].reverse().map(p => ({ day: shortDate(p.period), bytes: p.totalBytes }))
    : []

  return (
    <div className="ps-main">
      <div className="ps-page-header animate-fade-down">
        <div>
          <h1 className="ps-page-title">Dashboard</h1>
          <p className="ps-page-subtitle">Traffic and usage across all your shares</p>
        </div>
      </div>

      <div className="ps-page-content">
        {tunnels.length === 0 && (
          <div className="ps-card ps-overview-card animate-fade-up">
            <div className="ps-overview-card-head">
              <div>
                <div className="ps-overview-card-title">Share your first app</div>
                <div className="ps-overview-card-sub">Create a project, pick the ports your app runs on and get a link anyone can open.</div>
              </div>
              <button className="ps-btn ps-btn-primary ps-btn-sm" onClick={onNewShare}>New share</button>
            </div>
          </div>
        )}

        <div className="ps-overview-stats animate-fade-up">
          <div className="ps-stat-card">
            <div className="ps-stat-card-label">Requests</div>
            <div className="ps-stat-card-value">{totalRequests.toLocaleString()}</div>
            <div className="ps-stat-card-sub">Since Kexoz opened</div>
          </div>
          <div className="ps-stat-card">
            <div className="ps-stat-card-label">Data transferred</div>
            <div className="ps-stat-card-value">{formatBytes(bytesIn + bytesOut)}</div>
            <div className="ps-stat-card-sub">{formatBytes(bytesIn)} in · {formatBytes(bytesOut)} out</div>
          </div>
          <button type="button" className="ps-stat-card ps-stat-card-link" onClick={onViewShares}>
            <div className="ps-stat-card-label">Live shares</div>
            <div className="ps-stat-card-value">{liveShares}</div>
            <div className="ps-stat-card-sub">{tunnels.length} in total</div>
          </button>
          <div className="ps-stat-card">
            <div className="ps-stat-card-label">Avg response</div>
            <div className="ps-stat-card-value">{stats.avgMs != null ? `${stats.avgMs} ms` : '—'}</div>
            <div className="ps-stat-card-sub">Across recent requests</div>
          </div>
        </div>

        {tunnels.length > 0 && (
          <div className="animate-fade-up delay-100">
            <ConnectionPanel tunnels={tunnels} events={connectionEvents} />
          </div>
        )}

        <div className="ps-card ps-overview-card animate-fade-up delay-100">
          <div className="ps-overview-card-head">
            <div>
              <div className="ps-overview-card-title">Data this month</div>
              <div className="ps-overview-card-sub">
                {formatBytes(session.bandwidthUsed)} of {formatBytes(session.bandwidthLimit)} used
              </div>
            </div>
            <span className="ps-badge ps-badge-gray">{TIER_LABELS[tier]}</span>
          </div>
          <div className="ps-bandwidth-bar">
            <div className="ps-bandwidth-fill" style={{ width: `${bwPct}%`, background: bwPct >= 80 ? 'var(--yellow)' : undefined }} />
          </div>
          {bwPct >= 80 && (
            <div className="ps-overview-card-sub" style={{ marginTop: 10, color: 'var(--text)' }}>
              {bwPct >= 100
                ? 'You’ve used this month’s data. Visitors see a limit page until it resets or you upgrade.'
                : 'You’re close to this month’s data limit. Visitors see a limit page once it runs out.'}
              {tier !== 'pro_plus' && (
                <> <a href={upgradeUrl(session.id, tier === 'pro' ? 'pro_plus' : 'pro')} target="_blank" rel="noreferrer" style={{ color: 'var(--text-accent)' }}>See plans</a></>
              )}
            </div>
          )}
          {chartData.length > 0 ? (
            <div style={{ height: 140, marginTop: 18 }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorBw" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--green)" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="var(--green)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="day" tickLine={false} axisLine={false} tick={{ fill: 'var(--text-soft)', fontSize: 11 }} minTickGap={24} />
                  <Tooltip
                    contentStyle={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 6, fontSize: 12 }}
                    itemStyle={{ color: 'var(--text)' }}
                    formatter={(val: unknown) => [formatBytes(Number(val)), 'Traffic']}
                    labelStyle={{ color: 'var(--text-soft)', marginBottom: 4 }}
                  />
                  <Area type="monotone" dataKey="bytes" stroke="var(--green)" fill="url(#colorBw)" strokeWidth={1.5} isAnimationActive={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="ps-overview-empty">Daily usage shows up here once your shares get traffic.</div>
          )}
        </div>

        <div className="ps-overview-grid animate-fade-up delay-150">
          <div className="ps-card ps-overview-card">
            <div className="ps-overview-card-head">
              <div>
                <div className="ps-overview-card-title">Responses</div>
                <div className="ps-overview-card-sub">{stats.total.toLocaleString()} recent requests</div>
              </div>
              <button className="ps-btn ps-btn-ghost ps-btn-sm" onClick={onViewRequests}>View requests</button>
            </div>
            {stats.total === 0 ? (
              <div className="ps-overview-empty">No requests yet.</div>
            ) : (
              <div className="ps-status-rows">
                {stats.groups.map(group => (
                  <div key={group.key} className="ps-status-row">
                    <span className="ps-status-row-label">{group.label}</span>
                    <div className="ps-status-row-bar">
                      <div style={{ width: `${(group.count / stats.total) * 100}%`, background: group.color }} />
                    </div>
                    <span className="ps-status-row-count">{group.count}</span>
                  </div>
                ))}
                {stats.failed > 0 && (
                  <div className="ps-status-row">
                    <span className="ps-status-row-label">No response</span>
                    <div className="ps-status-row-bar">
                      <div style={{ width: `${(stats.failed / stats.total) * 100}%`, background: 'var(--text-soft)' }} />
                    </div>
                    <span className="ps-status-row-count">{stats.failed}</span>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="ps-card ps-overview-card">
            <div className="ps-overview-card-head">
              <div>
                <div className="ps-overview-card-title">Most visited</div>
                <div className="ps-overview-card-sub">Top paths in recent requests</div>
              </div>
            </div>
            {stats.topPaths.length === 0 ? (
              <div className="ps-overview-empty">No requests yet.</div>
            ) : (
              <div className="ps-top-paths">
                {stats.topPaths.map(([path, count]) => (
                  <div key={path} className="ps-top-path">
                    <span className="ps-top-path-name" title={path}>{path}</span>
                    <span className="ps-top-path-count">{count}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
