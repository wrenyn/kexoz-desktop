import { shareStatus } from '../../lib/shares'
import ShareList, { type ShareControls } from '../shares/ShareList'

type Props = ShareControls & {
  onNewTunnel: () => void
}

export default function TunnelsPage(props: Props) {
  const { persistentTunnels, onNewTunnel } = props
  const running = persistentTunnels.filter(tunnel => shareStatus(tunnel) === 'active').length

  return (
    <div className="ps-main">
      <div className="ps-page-header animate-fade-down">
        <div>
          <h1 className="ps-page-title">Shares</h1>
          <p className="ps-page-subtitle">
            {persistentTunnels.length === 0
              ? 'Ports, terminals and folders you share'
              : `${persistentTunnels.length} ${persistentTunnels.length === 1 ? 'share' : 'shares'}${running > 0 ? ` · ${running} running` : ''}`}
          </p>
        </div>
      </div>

      <div className="ps-page-content animate-fade-up">
        {persistentTunnels.length === 0 ? (
          <div className="ps-card">
            <div className="ps-empty">
              <span className="ps-empty-title">Nothing shared yet</span>
              <span className="ps-empty-sub">Share a local port, terminal or folder through a link.</span>
              <button type="button" className="ps-btn ps-btn-primary" onClick={onNewTunnel} style={{ marginTop: 8 }}>
                New share
              </button>
            </div>
          </div>
        ) : (
          <div className="ps-card ps-group">
            <ShareList {...props} tunnels={persistentTunnels} />
          </div>
        )}
      </div>
    </div>
  )
}
