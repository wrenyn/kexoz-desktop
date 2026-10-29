import { useEffect, useState } from 'react'
import { toast } from 'react-hot-toast'
import { connectGitHub, disconnectGitHub, listMyRepos, validRepo, type GitHubStatus } from '../../lib/github'
import { extractError } from '../../lib/utils'

type Props = {
  status: GitHubStatus
  repo: string
  shareName: string
  onStatus: (status: GitHubStatus) => void
  onRepo: (repo: string) => void
  onClose: () => void
}

export default function GitHubModal({ status, repo, shareName, onStatus, onRepo, onClose }: Props) {
  const [token, setToken] = useState('')
  const [busy, setBusy] = useState(false)
  const [repoDraft, setRepoDraft] = useState(repo)
  const [repos, setRepos] = useState<string[]>([])

  useEffect(() => {
    if (!status.connected) return
    let alive = true
    listMyRepos().then(list => { if (alive) setRepos(list) }).catch(() => {})
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
      const next = await connectGitHub(token.trim())
      if (next.error) throw new Error(next.error)
      setToken('')
      onStatus(next)
      toast.success(`Connected as ${next.login}`)
    } catch (err) {
      toast.error(extractError(err))
    } finally {
      setBusy(false)
    }
  }

  const disconnect = async () => {
    setBusy(true)
    try {
      await disconnectGitHub()
      onStatus({ connected: false, login: '', encrypted: false })
    } finally {
      setBusy(false)
    }
  }

  const cleanDraft = repoDraft.trim().replace(/^https:\/\/github\.com\//, '').replace(/\.git$/, '').replace(/\/$/, '')
  const repoOk = cleanDraft === '' || validRepo(cleanDraft)

  return (
    <div className="ps-modal-overlay" onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}>
      <div className="ps-modal ps-rv-modal" role="dialog" aria-modal="true" aria-labelledby="gh-title">
        <div className="ps-modal-header">
          <h2 className="ps-modal-title" id="gh-title">GitHub</h2>
        </div>
        <div className="ps-modal-body ps-rv-form">
          {status.connected ? (
            <div className="ps-rv-gh-row">
              <span>Connected as <strong>{status.login}</strong></span>
              <button type="button" className="ps-btn ps-btn-ghost ps-btn-sm ps-btn-text-danger" disabled={busy} onClick={() => void disconnect()}>Disconnect</button>
            </div>
          ) : (
            <form onSubmit={event => { event.preventDefault(); void connect() }} className="ps-rv-form">
              <label className="ps-label" htmlFor="gh-token">Personal access token</label>
              <input id="gh-token" className="ps-input" type="password" autoComplete="off" spellCheck={false} placeholder="github_pat_…" value={token} onChange={event => setToken(event.target.value)} />
              <p className="field-help">
                Use a fine-grained token with read and write access to Issues and read access to Pull requests and Contents.
                It stays on this computer{status.encrypted ? ', encrypted by your system keychain' : ''} and is only sent to GitHub.
              </p>
              <div>
                <button type="submit" className="ps-btn ps-btn-primary ps-btn-sm" disabled={busy || token.trim().length < 20}>{busy ? 'Checking…' : 'Connect'}</button>
              </div>
            </form>
          )}

          <label className="ps-label" htmlFor="gh-repo">Repository for {shareName}</label>
          <input id="gh-repo" className="ps-input" list="gh-repos" placeholder="owner/repo" spellCheck={false} value={repoDraft} onChange={event => setRepoDraft(event.target.value)} />
          <datalist id="gh-repos">{repos.map(name => <option key={name} value={name} />)}</datalist>
          <p className="field-help">{repoOk ? 'Issues for this share’s feedback open here, and its recent pull requests and commits can be attached to revisions.' : 'Use the owner/repo form, like acme/website.'}</p>
        </div>
        <div className="ps-modal-footer">
          <button type="button" className="ps-btn ps-btn-ghost" onClick={onClose}>Close</button>
          <button type="button" className="ps-btn ps-btn-primary" disabled={!repoOk || cleanDraft === repo} onClick={() => { onRepo(cleanDraft); onClose() }}>Save repository</button>
        </div>
      </div>
    </div>
  )
}
