import { useEffect, useState } from 'react'
import { toast } from 'react-hot-toast'
import { connectLinear, disconnectLinear, listLinearTeams, validTeamId, type LinearStatus } from '../../lib/linear'
import { extractError } from '../../lib/utils'

type Props = {
  status: LinearStatus
  teamId: string
  shareName: string
  onStatus: (status: LinearStatus) => void
  onTeam: (teamId: string) => void
  onClose: () => void
}

export default function LinearModal({ status, teamId, shareName, onStatus, onTeam, onClose }: Props) {
  const [token, setToken] = useState('')
  const [busy, setBusy] = useState(false)
  const [teamDraft, setTeamDraft] = useState(teamId)
  const [teams, setTeams] = useState<{ id: string; name: string; key: string }[]>([])

  useEffect(() => {
    if (!status.connected) return
    let alive = true
    listLinearTeams().then(list => { if (alive) setTeams(list) }).catch(() => {})
    return () => { alive = false }
  }, [status.connected])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const connect = async () => {
    setBusy(true)
    try {
      const next = await connectLinear(token.trim())
      if (next.error) throw new Error(next.error)
      setToken('')
      onStatus(next)
      toast.success(`Connected as ${next.name}`)
    } catch (err) {
      toast.error(extractError(err))
    } finally {
      setBusy(false)
    }
  }

  const disconnect = async () => {
    setBusy(true)
    try {
      await disconnectLinear()
      onStatus({ connected: false, name: '', encrypted: false })
    } finally {
      setBusy(false)
    }
  }

  const cleanDraft = teamDraft.trim()
  const teamOk = cleanDraft === '' || validTeamId(cleanDraft)

  return (
    <div className="ps-modal-overlay" onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}>
      <div className="ps-modal ps-rv-modal" role="dialog" aria-modal="true" aria-labelledby="ln-title">
        <div className="ps-modal-header">
          <h2 className="ps-modal-title" id="ln-title">Linear</h2>
        </div>
        <div className="ps-modal-body ps-rv-form">
          {status.connected ? (
            <div className="ps-rv-gh-row">
              <span>Connected as <strong>{status.name}</strong></span>
              <button type="button" className="ps-btn ps-btn-ghost ps-btn-sm ps-btn-text-danger" disabled={busy} onClick={() => void disconnect()}>Disconnect</button>
            </div>
          ) : (
            <form onSubmit={event => { event.preventDefault(); void connect() }} className="ps-rv-form">
              <label className="ps-label" htmlFor="ln-token">API key</label>
              <input id="ln-token" className="ps-input" type="password" autoComplete="off" spellCheck={false} placeholder="lin_api_…" value={token} onChange={event => setToken(event.target.value)} />
              <p className="field-help">
                Create a personal API key in Linear → Settings → API.
                It stays on this computer{status.encrypted ? ', encrypted by your system keychain' : ''} and is only sent to Linear.
              </p>
              <button type="submit" className="ps-btn ps-btn-primary" disabled={busy || token.trim().length < 20}>{busy ? 'Connecting…' : 'Connect'}</button>
            </form>
          )}

          {status.connected && (
            <div className="ps-rv-form" style={{ marginTop: 16 }}>
              <label className="ps-label" htmlFor="ln-team">Team for {shareName}</label>
              {teams.length > 0 ? (
                <select
                  id="ln-team"
                  className="ps-input"
                  value={cleanDraft}
                  onChange={event => setTeamDraft(event.target.value)}
                >
                  <option value="">Select a team…</option>
                  {teams.map(team => (
                    <option key={team.id} value={team.id}>{team.name} ({team.key})</option>
                  ))}
                </select>
              ) : (
                <input id="ln-team" className="ps-input" value={teamDraft} onChange={event => setTeamDraft(event.target.value)} placeholder="Team UUID" spellCheck={false} />
              )}
              {!teamOk && <p className="field-help" style={{ color: 'var(--ps-danger)' }}>Pick a Linear team.</p>}
            </div>
          )}
        </div>
        <div className="ps-modal-footer">
          <button type="button" className="ps-btn ps-btn-ghost" onClick={onClose}>Cancel</button>
          {status.connected && (
            <button
              type="button"
              className="ps-btn ps-btn-primary"
              disabled={!teamOk}
              onClick={() => {
                onTeam(cleanDraft)
                onClose()
              }}
            >
              Save
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
