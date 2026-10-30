import type { PathRoute } from '../../lib/api'
import { routeError } from '../../lib/shares'

type Props = {
  /** Routes other than /; / always goes to the share's own port. */
  rules: PathRoute[]
  onChange: (rules: PathRoute[]) => void
  fallbackPort: number | null
  portStatus?: Record<number, boolean | null>
}

const SUGGESTED_PATHS = ['/api', '/auth', '/ws', '/admin']

function PortStatus({ port, status }: { port: number; status?: Record<number, boolean | null> }) {
  if (!status) return null
  const value = status[port]
  return (
    <span className={`ps-route-port-status ${value === true ? 'listening' : value === false ? 'offline' : ''}`}>
      {value === true ? 'Running' : value === false ? 'Not running' : 'Checking'}
    </span>
  )
}

export default function RouteRulesEditor({ rules, onChange, fallbackPort, portStatus }: Props) {
  const addRule = () => {
    const used = new Set(rules.map(rule => rule.path.trim()))
    const path = SUGGESTED_PATHS.find(candidate => !used.has(candidate)) ?? ''
    onChange([...rules, { path, port: 8080 }])
  }
  const update = (index: number, next: PathRoute) => onChange(rules.map((rule, itemIndex) => itemIndex === index ? next : rule))

  return (
    <div className="ps-route-rules">
      <div className="ps-route-rules-head">
        <div className="ps-settings-row-desc">
          One link for your whole app: send paths like /api to your backend and everything else to your frontend.
        </div>
        <button type="button" className="ps-btn ps-btn-ghost ps-btn-sm" onClick={addRule}>Add path</button>
      </div>
      {rules.map((rule, index) => {
        const error = routeError(rule, rules.filter((_, itemIndex) => itemIndex !== index))
        return (
          <div key={index} className="ps-route-rule-wrap">
            <div className="ps-route-rule">
              <div className="ps-route-path">
                <input
                  className="ps-input ps-input-mono"
                  value={rule.path}
                  placeholder="/api"
                  aria-label="Path"
                  aria-invalid={Boolean(error)}
                  onChange={event => update(index, { ...rule, path: event.target.value })}
                />
              </div>
              <span className="ps-input-prefix">localhost:</span>
              <input
                className="ps-input ps-input-mono"
                type="number"
                min={1}
                max={65535}
                value={rule.port || ''}
                placeholder="8080"
                aria-label={`Port for ${rule.path || 'this path'}`}
                onChange={event => update(index, { ...rule, port: Number(event.target.value) })}
              />
              <PortStatus port={rule.port} status={portStatus} />
              <button type="button" className="ps-btn ps-btn-ghost ps-btn-sm" onClick={() => onChange(rules.filter((_, itemIndex) => itemIndex !== index))}>Remove</button>
            </div>
            {error && <span className="ps-route-error">{error}</span>}
          </div>
        )
      })}
      <div className="ps-route-rule ps-route-rule-fixed">
        <div className="ps-route-path">
          <input className="ps-input ps-input-mono" value="/" readOnly aria-label="Every other path" tabIndex={-1} />
          <span className="ps-route-fallback">Everything else</span>
        </div>
        <span className="ps-input-prefix">localhost:</span>
        <input className="ps-input ps-input-mono" value={fallbackPort ?? ''} readOnly aria-label="The share's port" tabIndex={-1} />
        {fallbackPort ? <PortStatus port={fallbackPort} status={portStatus} /> : <span />}
        <span />
      </div>
      {rules.length > 0 && (
        <p className="ps-panel-hint">
          The longest matching path wins, so /api/v2 can go somewhere other than /api. Your backend gets the full path, including the prefix.
        </p>
      )}
    </div>
  )
}
