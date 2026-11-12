import { useMemo } from 'react'
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis } from 'recharts'
import type { ClientSession, PersistentTunnel, PreviewNote, RequestLogEntry, UsagePoint } from '../../lib/api'
import { tierOf, upgradeUrl } from '../../lib/api'
import { shareStatus } from '../../lib/shares'
import { formatBytes } from '../../lib/utils'
import type { ConnectionEvent } from '../../hooks/useConnectionHistory'
import ConnectionPanel from '../dashboard/ConnectionPanel'
import WelcomePanel from '../dashboard/WelcomePanel'

type Props = {
  session: ClientSession
  tunnels: PersistentTunnel[]
  totalRequests: number
  requestLog: RequestLogEntry[]
  bytesIn: number
  bytesOut: number
  dailyUsage: UsagePoint[]
  connectionEvents: ConnectionEvent[]
  feedbackNotes: PreviewNote[]
  onNewShare: () => void
  onViewRequests: () => void
  onViewShares: () => void
  onViewFeedback: () => void
}

function shortDate(period: string): string {
  const date = new Date(period)
  return Number.isNaN(date.getTime()) ? period : date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export default function DashboardPage({
  session, tunnels, bytesIn, bytesOut, dailyUsage, connectionEvents,
  feedbackNotes, onNewShare, onViewRequests, onViewShares, onViewFeedback,
}: Props) {
  const tier = tierOf(session)
  const bwPct = session.bandwidthLimit > 0 ? Math.min(100, (session.bandwidthUsed / session.bandwidthLimit) * 100) : 0
  const liveShares = tunnels.filter(t => shareStatus(t) === 'active').length
  const openNotes = useMemo(() => feedbackNotes.filter(n => n.status === 'open').length, [feedbackNotes])

  const chartData = dailyUsage.length > 0
    ? [...dailyUsage].reverse().map(p => ({ day: shortDate(p.period), bytes: p.totalBytes }))
    : []

  if (tunnels.length === 0) return <WelcomePanel onNewShare={onNewShare} />

  return (
    <div className="ps-main">
      <div className="ps-page-header animate-fade-down">
        <div>
          <h1 className="ps-page-title">Overview</h1>
          {liveShares > 0 || openNotes > 0 ? (
            <p className="ps-page-subtitle">
              {[liveShares > 0 ? `${liveShares} live` : null, openNotes > 0 ? `${openNotes} notes` : null].filter(Boolean).join(' · ')}
            </p>
          ) : null}
        </div>
        <div className="ps-page-actions">
          <button type="button" className="ps-btn ps-btn-primary ps-btn-sm" onClick={onNewShare}>New share</button>
        </div>
      </div>

      <div className="ps-page-content">
        <div className="ps-overview-attention animate-fade-up">
          <button type="button" className="ps-attn-tile" onClick={onViewShares}>
            <span className="ps-attn-label">Live shares</span>
            <span className="ps-attn-value">{liveShares}</span>
            <span className="ps-attn-sub">View your shares</span>
          </button>
          <button type="button" className="ps-attn-tile" onClick={onViewFeedback}>
            <span className="ps-attn-label">Open feedback</span>
            <span className="ps-attn-value">{openNotes}</span>
            <span className="ps-attn-sub">Review reported issues</span>
          </button>
          <button type="button" className="ps-attn-tile" onClick={onViewRequests}>
            <span className="ps-attn-label">Traffic</span>
            <span className="ps-attn-value">{formatBytes(bytesIn + bytesOut)}</span>
            <span className="ps-attn-sub">Inspect requests</span>
          </button>
        </div>

        <div className="animate-fade-up delay-100">
          <ConnectionPanel tunnels={tunnels} events={connectionEvents} onNewShare={onNewShare} />
        </div>

        <div className="ps-card ps-overview-card animate-fade-up delay-150">
          <div className="ps-overview-card-head">
            <div>
              <div className="ps-overview-card-title">This month</div>
              <div className="ps-overview-card-sub">
                {formatBytes(session.bandwidthUsed)} of {formatBytes(session.bandwidthLimit)}
              </div>
            </div>
            <button type="button" className="ps-btn ps-btn-ghost ps-btn-sm" onClick={onViewRequests}>Traffic</button>
          </div>
          <div className="ps-bandwidth-bar">
            <div className="ps-bandwidth-fill" style={{ width: `${bwPct}%`, background: bwPct >= 80 ? 'var(--yellow)' : undefined }} />
          </div>
          {bwPct >= 80 && (
            <p className="ps-overview-warn">
              {bwPct >= 100 ? 'Monthly limit reached.' : 'Near the monthly limit.'}
              {tier !== 'pro_plus' && (
                <> <a href={upgradeUrl(session.id, tier === 'pro' ? 'pro_plus' : 'pro')} target="_blank" rel="noreferrer">Upgrade</a></>
              )}
            </p>
          )}
          {chartData.length > 0 ? (
            <div style={{ height: 140, marginTop: 16 }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorBw" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--green)" stopOpacity={0.22} />
                      <stop offset="95%" stopColor="var(--green)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="day" tickLine={false} axisLine={false} tick={{ fill: 'var(--text-soft)', fontSize: 11 }} minTickGap={24} />
                  <Tooltip
                    contentStyle={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }}
                    itemStyle={{ color: 'var(--text)' }}
                    formatter={(val: unknown) => [formatBytes(Number(val)), 'Traffic']}
                    labelStyle={{ color: 'var(--text-soft)', marginBottom: 4 }}
                  />
                  <Area type="monotone" dataKey="bytes" stroke="var(--green)" fill="url(#colorBw)" strokeWidth={1.5} isAnimationActive={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
