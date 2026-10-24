import { Plus, Trash2 } from 'lucide-react'

type RouteRule = { path: string; port: number }

type Props = {
  rules: RouteRule[]
  onChange: (rules: RouteRule[]) => void
  portStatus: Record<number, boolean | null>
}

export default function RouteRulesEditor({ rules, onChange, portStatus }: Props) {
  const addRule = () => onChange([...rules, { path: '/', port: 3000 }])
  return (
    <div className="ps-route-rules">
      <div className="ps-route-rules-head">
        <div>
          <div className="ps-settings-row-label">Path routing</div>
          <div className="ps-settings-row-desc">Route /api/* and other paths to different local ports.</div>
        </div>
        <button type="button" className="ps-btn ps-btn-ghost ps-btn-sm" onClick={addRule}><Plus size={13} /> Add route</button>
      </div>
      {rules.map((rule, index) => (
        <div className="ps-route-rule" key={index}>
          <div className="ps-route-path"><input className="ps-input ps-input-mono" value={rule.path} placeholder="/api/*" onChange={event => {
            const next = [...rules]
            next[index] = { ...rule, path: event.target.value }
            onChange(next)
          }} />{rule.path.trim().replace(/\/$/, '') === '' && <span className="ps-route-fallback">Fallback</span>}</div>
          <span className="ps-input-prefix">localhost:</span>
          <input className="ps-input ps-input-mono" type="number" min={1} max={65535} value={rule.port} onChange={event => {
            const next = [...rules]
            next[index] = { ...rule, port: Number(event.target.value) }
            onChange(next)
          }} />
          <span className={`ps-route-port-status ${portStatus[rule.port] === true ? 'listening' : portStatus[rule.port] === false ? 'offline' : ''}`}>{portStatus[rule.port] === true ? 'Listening' : portStatus[rule.port] === false ? 'Offline' : 'Checking'}</span>
          <button type="button" className="ps-btn-icon" title="Remove route" onClick={() => onChange(rules.filter((_, itemIndex) => itemIndex !== index))}><Trash2 size={13} /></button>
        </div>
      ))}
    </div>
  )
}
