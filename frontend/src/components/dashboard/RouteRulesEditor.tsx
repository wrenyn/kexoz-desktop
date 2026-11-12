import { useState } from 'react'
import type { PathRoute } from '../../lib/api'
import { routeError } from '../../lib/shares'

type Props = {
  rules: PathRoute[]
  onChange: (rules: PathRoute[]) => void
  fallbackPort: number | null
  portStatus?: Record<number, boolean | null>
  compact?: boolean
}

export default function RouteRulesEditor({ rules, onChange, fallbackPort, portStatus }: Props) {
  const [path, setPath] = useState('/api')
  const [port, setPort] = useState('8080')

  const add = () => {
    const nextPort = Number(port)
    const nextPath = path.trim().startsWith('/') ? path.trim() : `/${path.trim()}`
    if (!nextPath || nextPath === '/' || !Number.isInteger(nextPort) || nextPort < 1 || nextPort > 65535) return
    if (rules.some(rule => rule.path === nextPath)) return
    onChange([...rules, { path: nextPath, port: nextPort }])
    setPath('/api')
    setPort('8080')
  }

  return (
    <div className="ps-route-rules is-compact">
      <div className="ps-route-add">
        <input
          className="ps-input ps-input-mono"
          value={path}
          placeholder="/api"
          aria-label="Path"
          onChange={event => setPath(event.target.value)}
          onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); add() } }}
        />
        <span className="ps-input-prefix">localhost:</span>
        <input
          className="ps-input ps-input-mono"
          type="number"
          min={1}
          max={65535}
          value={port}
          placeholder="8080"
          aria-label="Backend port"
          onChange={event => setPort(event.target.value)}
          onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); add() } }}
        />
        <button type="button" className="ps-btn ps-btn-secondary ps-btn-sm" onClick={add}>Add</button>
      </div>

      {rules.map((rule, index) => {
        const error = routeError(rule, rules.filter((_, itemIndex) => itemIndex !== index))
        const listening = portStatus?.[rule.port]
        return (
          <div key={`${rule.path}-${index}`} className="ps-route-chip-row">
            <code className="ps-route-chip">{rule.path} → :{rule.port}</code>
            {listening === true ? <span className="ps-route-port-status listening">Up</span> : null}
            {listening === false ? <span className="ps-route-port-status offline">Down</span> : null}
            <button
              type="button"
              className="ps-btn ps-btn-ghost ps-btn-sm"
              onClick={() => onChange(rules.filter((_, itemIndex) => itemIndex !== index))}
            >
              Remove
            </button>
            {error ? <span className="ps-route-error">{error}</span> : null}
          </div>
        )
      })}

      <p className="ps-route-fallback-line">
        / → localhost:{fallbackPort ?? '—'}
      </p>
    </div>
  )
}
