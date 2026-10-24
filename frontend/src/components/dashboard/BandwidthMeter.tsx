import { Activity } from 'lucide-react'
import { Area, AreaChart, ResponsiveContainer, Tooltip } from 'recharts'
import { tierOf, type ClientSession, type UsagePoint } from '../../lib/api'

type BandwidthMeterProps = { 
  session: ClientSession
  dailyUsage?: UsagePoint[]
  onVerify?: () => void 
}

const TIER_LIMIT_LABEL: Record<string, string> = {
  anonymous: '100 MB guest',
  verified: '1 GB verified free',
  pro: '100 GB Pro',
  pro_plus: '500 GB Pro+',
}

export default function BandwidthMeter({ session, dailyUsage = [], onVerify }: BandwidthMeterProps) {
  const tier = tierOf(session)
  
  // Format data for chart
  const chartData = dailyUsage.map(p => ({
    time: p.period,
    bytes: p.totalBytes / 1024 / 1024 // MB
  }))

  return (
    <div className="bandwidth-section">
      <div className="bandwidth-header">
        <span className="bandwidth-label"><Activity size={16} /> Bandwidth Used ({TIER_LIMIT_LABEL[tier] ?? session.plan.toUpperCase()})</span>
        <span className="bandwidth-values">
          {(session.bandwidthUsed / 1024 / 1024).toFixed(1)} MB / {(session.bandwidthLimit / 1024 / 1024).toFixed(1)} MB
        </span>
      </div>
      <div className="bandwidth-track">
        <div 
          className="bandwidth-fill" 
          style={{ width: `${Math.min(100, (session.bandwidthUsed / session.bandwidthLimit) * 100)}%` }} 
        />
      </div>

      {chartData.length > 0 && (
        <div style={{ height: 60, marginTop: 12, width: '100%' }}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData}>
              <defs>
                <linearGradient id="colorBytes" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--green)" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="var(--green)" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <Tooltip 
                contentStyle={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 6, fontSize: 12, boxShadow: '0 4px 12px rgba(0,0,0,0.35)' }}
                itemStyle={{ color: 'var(--text)' }}
                formatter={(val: unknown) => [`${Number(val).toFixed(2)} MB`, 'Traffic']}
                labelStyle={{ color: 'var(--text-soft)', marginBottom: 4 }}
              />
              <Area 
                type="monotone" 
                dataKey="bytes" 
                stroke="var(--green)" 
                fillOpacity={1} 
                fill="url(#colorBytes)" 
                strokeWidth={2}
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {tier === 'anonymous' && (
        <div className="bandwidth-upgrade">
          <button type="button" className="ps-btn ps-btn-ghost ps-btn-sm" onClick={onVerify}>Verify with Google</button> for 1 GB free.
        </div>
      )}
      {tier === 'verified' && (
        <div className="bandwidth-upgrade">
          <a href="https://kexoz.dev/pricing" target="_blank" rel="noreferrer">Upgrade to Pro</a> for 100 GB limits and custom domains.
        </div>
      )}
    </div>
  )
}
