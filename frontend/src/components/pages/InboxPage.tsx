import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'react-hot-toast'
import {
  clearInbox, createInbox, deleteInboxRequest, fetchInbox, fetchInboxRequest, recordInboxResult, replayInboxRequest, updateInbox,
  type InboxRequest, type InboxView, type PersistentTunnel, type Project,
} from '../../lib/api'
import { redactBody, redactHeaders, redactPath } from '../../lib/redact'
import { formatBody, formatTime, methodClass, statusClass } from '../../lib/httpView'
import { environmentLabel, portForPath, shareLabel } from '../../lib/shares'
import { extractError, formatBytes, fromBase64 } from '../../lib/utils'
import { useConfirm } from '../../hooks/useConfirm'
import { useCopy } from '../../hooks/useCopy'

type Props = {
  clientId: string
  projects: Project[]
  tunnels: PersistentTunnel[]
  selectedId: string | null
  onSelect: (projectId: string) => void
}

type Tab = 'headers' | 'body' | 'response'

const REPLY_STATUSES = [200, 202, 204]
const SKIP_HEADERS = new Set(['host', 'content-length', 'connection', 'transfer-encoding', 'accept-encoding', 'x-forwarded-for', 'x-forwarded-proto', 'x-forwarded-host', 'x-real-ip'])
const REFRESH_MS = 5000

const DELIVERY_LABELS: Record<InboxRequest['delivery'], string> = {
  captured: 'Stored',
  forwarded: 'Forwarded',
  replayed: 'Replayed',
  failed: 'Failed',
}

function decodeBody(base64: string | undefined): { text: string; binary: boolean } {
  if (!base64) return { text: '', binary: false }
  const bytes = fromBase64(base64)
  const text = new TextDecoder().decode(bytes.subarray(0, 200 * 1024))
  const replaced = (text.match(/\uFFFD/g) ?? []).length
  return { text, binary: replaced > 8 && replaced > text.length / 50 }
}

const flatHeaders = (headers: Record<string, string[]> | undefined): Record<string, string> =>
  Object.fromEntries(Object.entries(headers ?? {}).map(([key, values]) => [key, values.join(', ')]))

export default function InboxPage({ clientId, projects, tunnels, selectedId, onSelect }: Props) {
  const project = projects.find(item => item.id === selectedId) ?? projects[0] ?? null
  const [view, setView] = useState<InboxView | null>(null)
  const [loadedFor, setLoadedFor] = useState<string | null>(null)
  const [selectedRequest, setSelectedRequest] = useState<string | null>(null)
  const [detail, setDetail] = useState<InboxRequest | null>(null)
  const [tab, setTab] = useState<Tab>('body')
  const [showSecrets, setShowSecrets] = useState(false)
  const [busy, setBusy] = useState(false)
  const [replaying, setReplaying] = useState(false)
  const { confirm, dialog } = useConfirm()
  const { copied, copy } = useCopy()

  const webShares = useMemo(() => {
    if (!project) return []
    const ids = new Set(project.tunnelIds)
    return tunnels.filter(tunnel => ids.has(tunnel.id) && (tunnel.tunnelType ?? 'http') === 'http')
  }, [project, tunnels])

  const projectId = project?.id ?? null

  const refresh = useCallback(async () => {
    if (!projectId) return
    try {
      const next = await fetchInbox(clientId, projectId)
      setView(next)
      setLoadedFor(projectId)
    } catch (err) {
      setLoadedFor(projectId)
      toast.error(extractError(err), { id: 'inbox-load' })
    }
  }, [clientId, projectId])

  useEffect(() => {
    setView(null)
    setSelectedRequest(null)
    setDetail(null)
    void refresh()
    const timer = window.setInterval(() => { if (document.visibilityState === 'visible') void refresh() }, REFRESH_MS)
    return () => window.clearInterval(timer)
  }, [refresh])

  useEffect(() => {
    if (!selectedRequest) { setDetail(null); return }
    let alive = true
    fetchInboxRequest(clientId, selectedRequest)
      .then(request => { if (alive) setDetail(request) })
      .catch(err => { if (alive) toast.error(extractError(err)) })
    return () => { alive = false }
  }, [clientId, selectedRequest])

  const inbox = view?.inbox ?? null
  const target = webShares.find(tunnel => tunnel.id === inbox?.targetTunnelId)
  const requests = view?.requests ?? []
  const summary = requests.find(item => item.id === selectedRequest)
  const shown = detail && detail.id === selectedRequest ? { ...summary, ...detail } as InboxRequest : summary

  const save = async (input: Parameters<typeof updateInbox>[2], message?: string) => {
    if (!project) return
    setBusy(true)
    try {
      const next = await updateInbox(clientId, project.id, input)
      setView(current => ({ ...next, requests: current?.requests ?? next.requests }))
      if (message) toast.success(message)
    } catch (err) {
      toast.error(extractError(err))
    } finally {
      setBusy(false)
    }
  }

  const create = async () => {
    if (!project) return
    setBusy(true)
    try {
      setView(await createInbox(clientId, project.id))
    } catch (err) {
      toast.error(extractError(err))
    } finally {
      setBusy(false)
    }
  }

  const rotate = async () => {
    const ok = await confirm({
      title: 'Get a new inbox URL?',
      message: 'The current URL stops working right away. Update every webhook and OAuth app that uses it.',
      confirmLabel: 'Get a new URL',
      tone: 'danger',
    })
    if (ok) await save({ rotateUrl: true }, 'New URL ready. Copy it to your webhook settings.')
  }

  const clearAll = async () => {
    if (!project) return
    const ok = await confirm({ title: 'Delete every stored request?', message: 'You can’t replay them afterwards.', confirmLabel: 'Delete all', tone: 'danger' })
    if (!ok) return
    try {
      await clearInbox(clientId, project.id)
      setSelectedRequest(null)
      await refresh()
    } catch (err) {
      toast.error(extractError(err))
    }
  }

  const remove = async (request: InboxRequest) => {
    try {
      await deleteInboxRequest(clientId, request.id)
      if (selectedRequest === request.id) setSelectedRequest(null)
      setView(current => current ? { ...current, requests: current.requests.filter(item => item.id !== request.id) } : current)
    } catch (err) {
      toast.error(extractError(err))
    }
  }

  const applyResult = (updated: InboxRequest) => {
    setDetail(current => current && current.id === updated.id ? { ...current, ...updated, bodyBase64: current.bodyBase64 } : current)
    setView(current => current ? { ...current, requests: current.requests.map(item => item.id === updated.id ? { ...item, ...updated, bodyBase64: undefined } : item) } : current)
  }

  /** Through the share when it is connected, so the request takes the real path; straight to the local port otherwise. */
  const replay = async (request: InboxRequest) => {
    setReplaying(true)
    try {
      if (view?.targetLive) {
        const updated = await replayInboxRequest(clientId, request.id)
        applyResult(updated)
        if (updated.delivery === 'failed') toast.error(updated.responseError || 'Your app did not answer')
        return
      }
      const share = target ?? webShares[0]
      if (!share || !window.kexoz?.localRequest) {
        toast.error('Start the inbox’s share to replay through it, or open Kexoz on the computer running your app.')
        return
      }
      const full = detail?.id === request.id ? detail : await fetchInboxRequest(clientId, request.id)
      const headers = Object.fromEntries(Object.entries(flatHeaders(full.headers)).filter(([key]) => !SKIP_HEADERS.has(key.toLowerCase())))
      const body = full.bodyBase64 ? fromBase64(full.bodyBase64) : undefined
      const started = Date.now()
      let updated: InboxRequest
      try {
        const result = await window.kexoz.localRequest({
          port: portForPath(share, full.path),
          method: full.method,
          path: full.path,
          headers,
          body: body && body.length > 0 && !['GET', 'HEAD'].includes(full.method) ? body : undefined,
        })
        const bytes = result.body instanceof Uint8Array ? result.body : new Uint8Array(result.body)
        updated = await recordInboxResult(clientId, request.id, {
          status: result.status,
          ms: Date.now() - started,
          body: new TextDecoder().decode(bytes.subarray(0, 64 * 1024)),
        })
      } catch (err) {
        const message = err instanceof Error ? err.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') : 'Your app did not answer'
        updated = await recordInboxResult(clientId, request.id, { ms: Date.now() - started, error: message })
      }
      applyResult(updated)
      if (updated.delivery === 'failed') toast.error(updated.responseError || 'Your app did not answer')
    } catch (err) {
      toast.error(extractError(err))
    } finally {
      setReplaying(false)
    }
  }

  const header = (
    <div className="ps-page-header animate-fade-down">
      <div>
        <h1 className="ps-page-title">Inbox</h1>
        <p className="ps-page-subtitle">A permanent URL for webhooks and OAuth callbacks. Kexoz keeps every request, even while your app is offline.</p>
      </div>
      {projects.length > 1 && project && (
        <div className="ps-header-actions">
          <select className="ps-select" value={project.id} onChange={event => onSelect(event.target.value)} aria-label="Project">
            {projects.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </div>
      )}
    </div>
  )

  if (!project) {
    return (
      <div className="ps-main">
        {header}
        <div className="ps-page-content animate-fade-up">
          <div className="ps-card">
            <div className="ps-empty">
              <span className="ps-empty-title">Create a project first</span>
              <span className="ps-empty-sub">Each project gets its own inbox, forwarded to one of its web shares.</span>
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (!inbox) {
    return (
      <div className="ps-main">
        {header}
        <div className="ps-page-content animate-fade-up">
          <div className="ps-card">
            <div className="ps-empty ps-empty-setup">
              <span className="ps-empty-title">{loadedFor === project.id ? `Give ${project.name} an inbox` : 'Loading…'}</span>
              {loadedFor === project.id && (
                <>
                  <span className="ps-empty-sub">
                    Point Stripe, GitHub or an OAuth app at one URL that never changes. While your app runs, requests go straight to it.
                    When it’s off, Kexoz stores them so you can replay them later. Keeps the last {view?.limit || 50}.
                  </span>
                  <button type="button" className="ps-btn ps-btn-primary" onClick={() => void create()} disabled={busy} style={{ marginTop: 8 }}>
                    Create inbox
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    )
  }

  const status = !inbox.forward
    ? `Live forwarding is off. Kexoz stores requests and answers ${inbox.replyStatus}.`
    : !target
      ? 'Pick a share to forward to. Until then, requests are stored.'
      : view?.targetLive
        ? `Forwarding live to ${shareLabel(target)}. Senders get your app’s answer.`
        : `${shareLabel(target)} isn’t running, so requests are stored and answered ${inbox.replyStatus}. Replay them once it’s up.`

  const body = shown ? decodeBody(shown.bodyBase64) : { text: '', binary: false }

  return (
    <div className="ps-main">
      {dialog}
      {header}
      <div className="ps-page-content animate-fade-up">
        <div className="ps-card ps-inbox-card">
          <div className="ps-inbox-url-row">
            <span className={`ps-share-dot ${inbox.forward && view?.targetLive ? 'active' : ''}`} aria-hidden="true" />
            <span className="ps-inbox-url" title={view?.url}>{view?.url}</span>
            <button type="button" className="ps-btn ps-btn-secondary ps-btn-sm" onClick={() => void copy('url', view?.url ?? '')}>{copied === 'url' ? 'Copied' : 'Copy'}</button>
            <button type="button" className="ps-btn ps-btn-ghost ps-btn-sm" onClick={() => void rotate()} disabled={busy}>New URL</button>
          </div>
          <p className="ps-panel-hint">{status} Add your app’s path after the URL, like <code>{view?.url}/webhooks/stripe</code>.</p>
          <div className="ps-inbox-settings">
            <label>
              <span>Forward to</span>
              <select className="ps-select" value={inbox.targetTunnelId} onChange={event => void save({ targetTunnelId: event.target.value })} disabled={busy}>
                <option value="">No share</option>
                {webShares.map(tunnel => (
                  <option key={tunnel.id} value={tunnel.id}>{shareLabel(tunnel)}{tunnel.environment ? ` (${environmentLabel(tunnel.environment)})` : ''}</option>
                ))}
              </select>
            </label>
            <label className="ps-req-check">
              <input type="checkbox" checked={inbox.forward} onChange={event => void save({ forward: event.target.checked })} disabled={busy} />
              Forward live while it runs
            </label>
            <label>
              <span>Answer while offline</span>
              <select className="ps-select" value={inbox.replyStatus} onChange={event => void save({ replyStatus: Number(event.target.value) })} disabled={busy}>
                {REPLY_STATUSES.map(code => <option key={code} value={code}>{code}</option>)}
              </select>
            </label>
            <span className="ps-panel-hint">Keeps the last {view?.limit.toLocaleString()} for {view?.retentionDays} days</span>
          </div>
        </div>

        {requests.length === 0 ? (
          <div className="ps-card">
            <div className="ps-empty">
              <span className="ps-empty-title">No requests yet</span>
              <span className="ps-empty-sub">Send a test webhook to the URL above. It shows up here within a few seconds.</span>
            </div>
          </div>
        ) : (
          <>
            <div className="ps-req-filters">
              <span className="ps-panel-hint">{requests.length === 100 ? 'Latest 100 requests' : `${requests.length} ${requests.length === 1 ? 'request' : 'requests'}`}</span>
              <label className="ps-req-check">
                <input type="checkbox" checked={showSecrets} onChange={event => setShowSecrets(event.target.checked)} />
                Show secrets
              </label>
              <button type="button" className="ps-btn ps-btn-ghost ps-btn-sm ps-btn-text-danger" onClick={() => void clearAll()}>Delete all</button>
            </div>
            <div className="ps-card ps-inspector">
              <div className="ps-req-list" style={{ width: 380 }}>
                {requests.map(request => (
                  <div
                    key={request.id}
                    className={`ps-req-item ${selectedRequest === request.id ? 'selected' : ''}`}
                    onClick={() => { setSelectedRequest(request.id); setTab('body') }}
                  >
                    <span className={methodClass(request.method)}>{request.method}</span>
                    <span className="ps-req-path">{redactPath(request.path, showSecrets)}</span>
                    <div className="ps-req-meta">
                      <span className={`ps-inbox-delivery ${request.delivery}`}>{DELIVERY_LABELS[request.delivery]}</span>
                      {request.responseStatus ? <span className={`ps-req-status ${statusClass(request.responseStatus)}`}>{request.responseStatus}</span> : null}
                      <span className="ps-req-time">{formatTime(request.receivedAt)}</span>
                    </div>
                  </div>
                ))}
              </div>
              <div className="ps-detail-panel">
                {shown ? (
                  <>
                    <div className="ps-detail-panel-header">
                      <div className="ps-detail-title-row">
                        <span className={methodClass(shown.method)}>{shown.method}</span>
                        <span className="ps-detail-path" title={redactPath(shown.path, showSecrets)}>{redactPath(shown.path, showSecrets)}</span>
                        <span className="ps-detail-duration">{new Date(shown.receivedAt).toLocaleString()}</span>
                      </div>
                      <div className="ps-detail-actions">
                        <button
                          type="button"
                          className="ps-btn ps-btn-primary ps-btn-sm"
                          onClick={() => void replay(shown)}
                          disabled={replaying}
                          title={view?.targetLive ? 'Send it through your share again' : 'Send it straight to your app on this computer'}
                        >
                          {replaying ? 'Sending…' : view?.targetLive ? 'Replay' : 'Replay to my app'}
                        </button>
                        <button type="button" className="ps-btn ps-btn-ghost ps-btn-sm ps-btn-text-danger" onClick={() => void remove(shown)}>Delete</button>
                        <span className="ps-detail-duration">
                          {DELIVERY_LABELS[shown.delivery]}
                          {shown.responseStatus ? `, your app answered ${shown.responseStatus}` : ''}
                          {shown.responseMs ? ` in ${shown.responseMs} ms` : ''}
                          {shown.replayCount > 0 ? ` · replayed ${shown.replayCount}×` : ''}
                        </span>
                      </div>
                    </div>
                    <div className="ps-detail-tabs">
                      {(['body', 'headers', 'response'] as const).map(id => (
                        <button key={id} type="button" className={`ps-tab ${tab === id ? 'active' : ''}`} onClick={() => setTab(id)}>
                          {id === 'body' ? 'Body' : id === 'headers' ? 'Headers' : 'Your app’s answer'}
                        </button>
                      ))}
                    </div>
                    <div className="ps-detail-body animate-fade-in">
                      {tab === 'body' && (
                        <div>
                          <div className="ps-detail-label">
                            {shown.contentType || 'No content type'} · {formatBytes(shown.bodySize)}
                          </div>
                          {shown.bodySize === 0 ? (
                            <div className="ps-code" style={{ color: 'var(--text-soft)' }}>Empty</div>
                          ) : !shown.bodyBase64 ? (
                            <div className="ps-code" style={{ color: 'var(--text-soft)' }}>Loading…</div>
                          ) : body.binary ? (
                            <div className="ps-code" style={{ color: 'var(--text-soft)' }}>Binary body, {formatBytes(shown.bodySize)}</div>
                          ) : (
                            <div className="ps-code" style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }} dangerouslySetInnerHTML={{ __html: formatBody(redactBody(body.text, showSecrets)) || 'Empty' }} />
                          )}
                        </div>
                      )}
                      {tab === 'headers' && (
                        <div>
                          <div className="ps-detail-label">From {shown.remoteIp || 'unknown'}</div>
                          <div className="ps-code">
                            {redactHeaders(flatHeaders(shown.headers), showSecrets).map(([key, value]) => (
                              <div key={key}><span style={{ color: 'var(--text-muted)' }}>{key}:</span> {value}</div>
                            ))}
                          </div>
                        </div>
                      )}
                      {tab === 'response' && (
                        <div>
                          {shown.delivery === 'captured' ? (
                            <div className="ps-code" style={{ color: 'var(--text-soft)' }}>Not delivered yet. Replay it once your app is running.</div>
                          ) : shown.responseError ? (
                            <div className="ps-code" style={{ color: 'var(--red)' }}>{shown.responseError}</div>
                          ) : (
                            <>
                              <div className="ps-detail-label">
                                {shown.responseStatus} {shown.deliveredAt ? `at ${new Date(shown.deliveredAt).toLocaleTimeString()}` : ''}
                              </div>
                              <div className="ps-code" style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }} dangerouslySetInnerHTML={{ __html: formatBody(redactBody(shown.responseBody, showSecrets)) || 'Empty' }} />
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  </>
                ) : (
                  <div className="ps-empty" style={{ flex: 1 }}>
                    <span className="ps-empty-title">Select a request</span>
                    <span className="ps-empty-sub">See its body and headers, then replay it to your app.</span>
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
