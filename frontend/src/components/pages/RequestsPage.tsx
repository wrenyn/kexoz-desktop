import { useMemo, useState } from 'react'
import { ROOT_DOMAIN, type PersistentTunnel, type RequestLogEntry } from '../../lib/api'
import { isNoiseRequestPath } from '../../lib/tunnel'
import { redactBody, redactHeaders, redactPath } from '../../lib/redact'
import { formatBody, formatTime, methodClass, statusClass } from '../../lib/httpView'
import { portForPath } from '../../lib/shares'

const SLOW_MS = 1000

type Props = {
  requestLog: RequestLogEntry[]
  onClear: () => void
  retention: number
  onRetentionChange: (value: number) => void
  /** Every web address the user owns, main address first. */
  hosts: string[]
  tunnels: PersistentTunnel[]
}

const HOST_STORAGE_KEY = 'kexoz-requests-host'
const ALL_HOSTS = 'all'

const shortHost = (host: string) => host.endsWith(`.${ROOT_DOMAIN}`) ? host.slice(0, -ROOT_DOMAIN.length - 1) : host

type Draft = { method: string; path: string; headers: string; body: string }
type SendResult = { status: number; durationMs: number; body: string; headers: Record<string, string[]> } | { error: string }

const EDIT_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']
const HOP_HEADERS = new Set(['host', 'content-length', 'connection', 'transfer-encoding', 'x-forwarded-host', 'x-forwarded-for', 'x-forwarded-proto', 'x-real-ip', 'accept-encoding'])

function requestHost(entry: RequestLogEntry): string {
  return (Object.entries(entry.headers ?? {}).find(([key]) => ['x-forwarded-host', 'host'].includes(key.toLowerCase()))?.[1] ?? '').toLowerCase().replace(/:\d+$/, '')
}

/** The local port a request was forwarded to, honouring path routes. */
function localPortFor(entry: RequestLogEntry, tunnels: PersistentTunnel[]): number | null {
  if (entry.port) return entry.port
  const host = requestHost(entry)
  const tunnel = tunnels.find(t => (t.subdomain && `${t.subdomain}.${ROOT_DOMAIN}` === host) || (t.customDomain && t.customDomain === host))
  return tunnel ? portForPath(tunnel, entry.path) : null
}

function parseHeaderText(text: string): Record<string, string> {
  const headers: Record<string, string> = {}
  for (const line of text.split('\n')) {
    const index = line.indexOf(':')
    if (index <= 0) continue
    const key = line.slice(0, index).trim()
    if (key && !HOP_HEADERS.has(key.toLowerCase())) headers[key] = line.slice(index + 1).trim()
  }
  return headers
}

function downloadFile(name: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = name
  anchor.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function toHar(entries: RequestLogEntry[], base: (entry: RequestLogEntry) => string, showSensitive: boolean) {
  const pairs = (headers: Record<string, string> | undefined) => redactHeaders(headers, showSensitive).map(([name, value]) => ({ name, value }))
  const header = (headers: Record<string, string> | undefined, name: string) =>
    Object.entries(headers ?? {}).find(([key]) => key.toLowerCase() === name)?.[1] ?? ''
  return {
    log: {
      version: '1.2',
      creator: { name: 'Kexoz', version: '1' },
      entries: entries.map(entry => {
        const url = `${base(entry).replace(/\/$/, '')}${redactPath(entry.path, showSensitive)}`
        const body = redactBody(entry.body, showSensitive)
        const responseBody = redactBody(entry.responseBody, showSensitive)
        let query: { name: string; value: string }[] = []
        try { query = [...new URL(url).searchParams.entries()].map(([name, value]) => ({ name, value })) } catch { /* relative */ }
        return {
          startedDateTime: entry.timestamp,
          time: entry.durationMs ?? 0,
          request: {
            method: entry.method,
            url,
            httpVersion: 'HTTP/1.1',
            headers: pairs(entry.headers),
            queryString: query,
            cookies: [],
            headersSize: -1,
            bodySize: body ? body.length : 0,
            ...(body ? { postData: { mimeType: header(entry.headers, 'content-type') || 'application/octet-stream', text: body } } : {}),
          },
          response: {
            status: entry.status ?? 0,
            statusText: '',
            httpVersion: 'HTTP/1.1',
            headers: pairs(entry.responseHeaders),
            cookies: [],
            content: { size: responseBody?.length ?? 0, mimeType: header(entry.responseHeaders, 'content-type') || 'application/octet-stream', text: responseBody ?? '' },
            redirectURL: header(entry.responseHeaders, 'location'),
            headersSize: -1,
            bodySize: -1,
          },
          cache: {},
          timings: { send: 0, wait: entry.durationMs ?? 0, receive: 0 },
        }
      }),
    },
  }
}

type DetailTab = 'headers' | 'body' | 'response'

const DETAIL_TABS: { id: DetailTab; label: string }[] = [
  { id: 'headers', label: 'Headers' },
  { id: 'body', label: 'Body' },
  { id: 'response', label: 'Response' },
]

function shellQuote(value: string) {
  return `'${value.replace(/'/g, `'\\''`)}'`
}

function curlCommand(entry: RequestLogEntry, base: string, showSensitive: boolean) {
  const headers = redactHeaders(entry.headers, showSensitive)
    .filter(([key]) => !['host', 'x-forwarded-host'].includes(key.toLowerCase()))
    .map(([key, value]) => ` -H ${shellQuote(`${key}: ${value}`)}`).join('')
  const raw = redactBody(entry.body, showSensitive)
  const body = raw ? ` --data-raw ${shellQuote(raw)}` : ''
  return `curl -X ${entry.method}${headers}${body} ${shellQuote(base.replace(/\/$/, '') + redactPath(entry.path, showSensitive))}`
}

function HeaderList({ headers, showSensitive, empty }: { headers: Record<string, string> | undefined; showSensitive: boolean; empty: string }) {
  const rows = redactHeaders(headers, showSensitive)
  if (rows.length === 0) return <div className="ps-code" style={{ color: 'var(--text-soft)' }}>{empty}</div>
  return (
    <div className="ps-code">
      {rows.map(([key, value]) => (
        <div key={key}><span style={{ color: 'var(--text-muted)' }}>{key}:</span> {value}</div>
      ))}
    </div>
  )
}

export default function RequestsPage({ requestLog, onClear, retention, onRetentionChange, hosts, tunnels }: Props) {
  const [savedHost, setSavedHost] = useState(() => window.localStorage.getItem(HOST_STORAGE_KEY) ?? ALL_HOSTS)
  const host = hosts.length > 1 && hosts.includes(savedHost) ? savedHost : ALL_HOSTS
  const [selected, setSelected] = useState<RequestLogEntry | null>(null)
  const [activeTab, setActiveTab] = useState<DetailTab>('headers')
  const [showFrameworkRequests, setShowFrameworkRequests] = useState(false)
  const [search, setSearch] = useState('')
  const [methodFilter, setMethodFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [showSensitive, setShowSensitive] = useState(false)
  const [copied, setCopied] = useState(false)
  const [linkCopied, setLinkCopied] = useState(false)
  const [replaying, setReplaying] = useState(false)
  const [replayResult, setReplayResult] = useState<{ status: number; ok: boolean; durationMs?: number } | null>(null)
  const [originalForReplay, setOriginalForReplay] = useState<{ status: number | null; durationMs: number | null } | null>(null)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [sending, setSending] = useState(false)
  const [sendResult, setSendResult] = useState<SendResult | null>(null)
  const [exportOpen, setExportOpen] = useState(false)

  const selectEntry = (entry: RequestLogEntry) => {
    setSelected(entry)
    setDraft(null)
    setSendResult(null)
    setReplayResult(null)
  }

  const startEditing = () => {
    if (!selected) return
    setDraft({
      method: selected.method,
      path: selected.path,
      headers: Object.entries(selected.headers ?? {})
        .filter(([key]) => !HOP_HEADERS.has(key.toLowerCase()))
        .map(([key, value]) => `${key}: ${value}`).join('\n'),
      body: selected.body ?? '',
    })
    setSendResult(null)
    setActiveTab('body')
  }

  const sendDraft = async () => {
    if (!selected || !draft) return
    const port = localPortFor(selected, tunnels)
    if (!port || !window.kexoz?.localRequest) {
      setSendResult({ error: 'Could not tell which local app this request went to. Start its share and try again.' })
      return
    }
    setSending(true)
    setSendResult(null)
    const start = Date.now()
    try {
      const path = draft.path.startsWith('/') ? draft.path : `/${draft.path}`
      const sendsBody = !['GET', 'HEAD'].includes(draft.method) && draft.body !== ''
      const result = await window.kexoz.localRequest({
        port,
        method: draft.method,
        path,
        headers: parseHeaderText(draft.headers),
        body: sendsBody ? new TextEncoder().encode(draft.body) : undefined,
      })
      const bytes = result.body instanceof Uint8Array ? result.body : new Uint8Array(result.body)
      const text = new TextDecoder().decode(bytes.subarray(0, 200 * 1024))
      setSendResult({ status: result.status, durationMs: Date.now() - start, body: text, headers: result.headers })
    } catch (err) {
      setSendResult({ error: err instanceof Error ? err.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') : 'Your app did not answer' })
    } finally {
      setSending(false)
    }
  }

  const exportLog = (format: 'har' | 'json') => {
    setExportOpen(false)
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
    if (format === 'har') {
      downloadFile(`kexoz-requests-${stamp}.har`, JSON.stringify(toHar(displayLog, replayBase, showSensitive), null, 2), 'application/json')
      return
    }
    const entries = displayLog.map(entry => ({
      ...entry,
      path: redactPath(entry.path, showSensitive),
      body: redactBody(entry.body, showSensitive),
      responseBody: redactBody(entry.responseBody, showSensitive),
      headers: Object.fromEntries(redactHeaders(entry.headers, showSensitive)),
      responseHeaders: Object.fromEntries(redactHeaders(entry.responseHeaders, showSensitive)),
    }))
    downloadFile(`kexoz-requests-${stamp}.json`, JSON.stringify(entries, null, 2), 'application/json')
  }

  const [listWidth, setListWidth] = useState(380)
  const handleResizeStart = (e: React.MouseEvent) => {
    e.preventDefault()
    const startX = e.clientX
    const startWidth = listWidth

    const handleMouseMove = (ev: MouseEvent) => {
      setListWidth(Math.max(280, Math.min(800, startWidth + (ev.clientX - startX))))
    }
    const handleMouseUp = () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
      document.body.style.cursor = 'default'
    }
    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
    document.body.style.cursor = 'col-resize'
  }

  // Replay goes back to the share the request arrived on, not whichever share is selected.
  const replayBase = (entry: RequestLogEntry | null) => {
    const entryHost = Object.entries(entry?.headers ?? {}).find(([key]) => ['x-forwarded-host', 'host'].includes(key.toLowerCase()))?.[1]
    const fallback = host === ALL_HOSTS ? hosts[0] : host
    return entryHost ? `https://${entryHost}` : fallback ? `https://${fallback}` : ''
  }

  const replayRequest = async () => {
    const base = replayBase(selected)
    if (!selected || !base) return
    setReplaying(true)
    setReplayResult(null)
    setOriginalForReplay({ status: selected.status ?? null, durationMs: selected.durationMs ?? null })
    const replayStart = Date.now()
    try {
      const url = base.replace(/\/$/, '') + selected.path
      const init: RequestInit = {
        method: selected.method,
        headers: Object.fromEntries(
          Object.entries(selected.headers ?? {}).filter(([k]) =>
            !['host', 'content-length', 'x-forwarded-host'].includes(k.toLowerCase())
          )
        ),
      }
      if (selected.body && !['GET', 'HEAD'].includes(selected.method)) {
        init.body = selected.body
      }
      const res = await fetch(url, init)
      setReplayResult({ status: res.status, ok: res.ok, durationMs: Date.now() - replayStart })
    } catch {
      setReplayResult({ status: 0, ok: false, durationMs: Date.now() - replayStart })
    } finally {
      setReplaying(false)
    }
  }

  const hostLog = useMemo(
    () => host === ALL_HOSTS ? requestLog : requestLog.filter(entry => requestHost(entry) === host),
    [requestLog, host],
  )
  const methods = useMemo(() => [...new Set(hostLog.map(entry => entry.method))].sort(), [hostLog])
  const displayLog = hostLog.filter(entry => {
    if (!showFrameworkRequests && isNoiseRequestPath(entry.path)) return false
    if (methodFilter !== 'all' && entry.method !== methodFilter) return false
    if (statusFilter === 'failed') {
      if (entry.status != null && entry.status < 400) return false
    } else if (statusFilter === 'slow') {
      if ((entry.durationMs ?? 0) < SLOW_MS) return false
    } else if (statusFilter !== 'all' && !String(entry.status ?? '').startsWith(statusFilter)) return false
    const query = search.trim().toLowerCase()
    if (!query) return true
    return `${entry.method} ${entry.path}`.toLowerCase().includes(query) ||
      (entry.body ?? '').toLowerCase().includes(query) ||
      (entry.responseBody ?? '').toLowerCase().includes(query) ||
      Object.entries(entry.headers ?? {}).some(([key, value]) => `${key}: ${value}`.toLowerCase().includes(query))
  })

  const copyCurl = async () => {
    if (!selected) return
    await navigator.clipboard.writeText(curlCommand(selected, replayBase(selected), showSensitive))
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1500)
  }

  const emptyLink = host === ALL_HOSTS ? hosts[0] : host
  const copyLink = async () => {
    if (!emptyLink) return
    await navigator.clipboard.writeText(`https://${emptyLink}`).catch(() => {})
    setLinkCopied(true)
    window.setTimeout(() => setLinkCopied(false), 1500)
  }

  const changeHost = (next: string) => {
    setSavedHost(next)
    window.localStorage.setItem(HOST_STORAGE_KEY, next)
    setSelected(null)
    setDraft(null)
    setMethodFilter('all')
  }

  const hasRequests = hostLog.length > 0
  const showHostInRows = host === ALL_HOSTS && hosts.length > 1

  return (
    <div className="ps-main ps-requests-main">
      <div className="ps-page-header animate-fade-down">
        <div>
          <h1 className="ps-page-title">Requests</h1>
          <p className="ps-page-subtitle">
            {hasRequests
              ? `${displayLog.length} of ${hostLog.length} shown`
              : hosts.length > 1 ? 'Live traffic coming through your links' : 'Live traffic coming through your link'}
          </p>
        </div>
        <div className="ps-header-actions">
          {hosts.length > 1 && (
            <label className="ps-req-retention">
              Link
              <select value={host} onChange={event => changeHost(event.target.value)}>
                <option value={ALL_HOSTS}>All links</option>
                {hosts.map(name => <option key={name} value={name}>{name}</option>)}
              </select>
            </label>
          )}
          <label className="ps-req-retention">
            Keep last
            <select value={retention} onChange={event => onRetentionChange(Number(event.target.value))}>
              <option value={50}>50</option>
              <option value={100}>100</option>
              <option value={250}>250</option>
            </select>
          </label>
          <div className="ps-req-export">
            <button className="ps-btn ps-btn-secondary ps-btn-sm" onClick={() => setExportOpen(v => !v)} disabled={displayLog.length === 0} aria-expanded={exportOpen}>
              Export
            </button>
            {exportOpen && (
              <div className="ps-req-export-menu" role="menu">
                <button role="menuitem" onClick={() => exportLog('har')}>HAR file<span>Opens in browser dev tools</span></button>
                <button role="menuitem" onClick={() => exportLog('json')}>JSON<span>Raw requests and responses</span></button>
              </div>
            )}
          </div>
          <button className="ps-btn ps-btn-secondary ps-btn-sm" onClick={onClear} disabled={requestLog.length === 0}>
            Clear
          </button>
        </div>
      </div>

      <div className="ps-requests-body animate-fade-up">
        {!hasRequests ? (
          <div className="ps-card ps-req-empty-card">
            <span className="ps-empty-title">{host === ALL_HOSTS ? 'No requests yet' : 'No requests on this link yet'}</span>
            <span className="ps-empty-sub">Open your link in a browser and each request will show up here.</span>
            {emptyLink && (
              <div className="ps-req-empty-link">
                <span className="ps-req-empty-url">https://{emptyLink}</span>
                <button className="ps-btn ps-btn-secondary ps-btn-sm" onClick={() => void copyLink()}>
                  {linkCopied ? 'Copied' : 'Copy link'}
                </button>
              </div>
            )}
          </div>
        ) : (
          <>
            <div className="ps-req-filters">
              <div className="ps-req-search">
                <input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search paths, headers and bodies" />
              </div>
              <select value={methodFilter} onChange={event => setMethodFilter(event.target.value)} aria-label="Method">
                <option value="all">All methods</option>
                {methods.map(method => <option key={method} value={method}>{method}</option>)}
              </select>
              <select value={statusFilter} onChange={event => setStatusFilter(event.target.value)} aria-label="Status">
                <option value="all">All statuses</option>
                <option value="failed">Failed</option>
                <option value="slow">Slower than 1 s</option>
                <option value="2">2xx</option>
                <option value="3">3xx</option>
                <option value="4">4xx</option>
                <option value="5">5xx</option>
              </select>
              <label className="ps-req-check">
                <input type="checkbox" checked={showFrameworkRequests} onChange={event => setShowFrameworkRequests(event.target.checked)} />
                Show assets
              </label>
              <label className="ps-req-check">
                <input type="checkbox" checked={showSensitive} onChange={event => setShowSensitive(event.target.checked)} />
                Show secrets
              </label>
            </div>

            <div className="ps-card ps-inspector">
              <div className="ps-req-list" style={{ width: listWidth }}>
                {displayLog.length === 0 ? (
                  <div className="ps-empty" style={{ flex: 1 }}>
                    <span className="ps-empty-title">Nothing matches</span>
                    <span className="ps-empty-sub">Try a different search or filter.</span>
                  </div>
                ) : (
                  [...displayLog].reverse().map((entry, i) => (
                    <div
                      key={`${entry.id}-${i}`}
                      className={`ps-req-item ${selected?.id === entry.id ? 'selected' : ''}`}
                      onClick={() => selectEntry(entry)}
                      style={{ animationDelay: `${Math.min(i * 20, 200)}ms` }}
                    >
                      <span className={methodClass(entry.method)}>{entry.method}</span>
                      <span className="ps-req-path">
                        {showHostInRows && requestHost(entry) && <span className="ps-req-host">{shortHost(requestHost(entry))}</span>}
                        {redactPath(entry.path, showSensitive)}
                      </span>
                      <div className="ps-req-meta">
                        <span className={`ps-req-status ${statusClass(entry.status)}`}>{entry.status ?? 'error'}</span>
                        <span className="ps-req-time">{formatTime(entry.timestamp)}</span>
                      </div>
                    </div>
                  ))
                )}
              </div>

              <div
                className="ps-req-resize"
                role="separator"
                aria-orientation="vertical"
                aria-label="Resize request list"
                aria-valuenow={listWidth}
                aria-valuemin={280}
                aria-valuemax={800}
                tabIndex={0}
                onMouseDown={handleResizeStart}
                onKeyDown={event => {
                  if (event.key === 'ArrowLeft')  { event.preventDefault(); setListWidth(width => Math.max(280, width - 16)) }
                  if (event.key === 'ArrowRight') { event.preventDefault(); setListWidth(width => Math.min(800, width + 16)) }
                  if (event.key === 'Home')       { event.preventDefault(); setListWidth(280) }
                  if (event.key === 'End')        { event.preventDefault(); setListWidth(800) }
                }}
              />

              <div className="ps-detail-panel">
                {selected ? (
                  <>
                    <div className="ps-detail-panel-header">
                      <div className="ps-detail-title-row">
                        <span className={methodClass(selected.method)}>{selected.method}</span>
                        <span className="ps-detail-path" title={redactPath(selected.path, showSensitive)}>{redactPath(selected.path, showSensitive)}</span>
                        <span className={`ps-badge ${selected.status && selected.status < 400 ? 'ps-badge-green' : 'ps-badge-red'}`}>
                          {selected.status ?? 'Error'}
                        </span>
                        {selected.durationMs != null && (
                          <span className="ps-detail-duration" title="Time your app took to answer">{selected.durationMs} ms</span>
                        )}
                        <span className="ps-detail-duration">{formatTime(selected.timestamp)}</span>
                      </div>
                      <div className="ps-detail-actions">
                        <button
                          className="ps-btn ps-btn-secondary ps-btn-sm"
                          onClick={() => void replayRequest()}
                          disabled={replaying || !replayBase(selected)}
                          title="Send this request to your link again"
                        >
                          {replaying ? 'Sending…' : 'Send again'}
                        </button>
                        <button
                          className="ps-btn ps-btn-ghost ps-btn-sm"
                          onClick={startEditing}
                          disabled={draft !== null}
                          title="Change the body or headers and send it straight to your app"
                        >
                          Edit and resend
                        </button>
                        <button className="ps-btn ps-btn-ghost ps-btn-sm" onClick={() => void copyCurl()}>
                          {copied ? 'Copied' : 'Copy as curl'}
                        </button>
                        {replayResult && originalForReplay && (
                          <span className="ps-replay-diff">
                            <span className="ps-replay-diff-orig">
                              Was {originalForReplay.status ?? '?'}
                              {originalForReplay.durationMs != null ? ` in ${originalForReplay.durationMs} ms` : ''},
                            </span>
                            <span className={`ps-replay-diff-new ${replayResult.ok ? 'ok' : 'err'}`}>
                              now {replayResult.status || 'error'}
                              {replayResult.durationMs != null ? ` in ${replayResult.durationMs} ms` : ''}
                            </span>
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="ps-detail-tabs">
                      {DETAIL_TABS.map(tab => (
                        <button
                          key={tab.id}
                          className={`ps-tab ${activeTab === tab.id ? 'active' : ''}`}
                          onClick={() => setActiveTab(tab.id)}
                        >
                          {tab.label}
                        </button>
                      ))}
                    </div>

                    <div className="ps-detail-body animate-fade-in">
                      {draft && (
                        <div className="ps-req-editor">
                          <div className="ps-req-editor-line">
                            <select value={draft.method} onChange={event => setDraft({ ...draft, method: event.target.value })} aria-label="Method">
                              {[...new Set([draft.method, ...EDIT_METHODS])].map(method => <option key={method} value={method}>{method}</option>)}
                            </select>
                            <input
                              className="ps-input ps-input-mono"
                              value={draft.path}
                              onChange={event => setDraft({ ...draft, path: event.target.value })}
                              aria-label="Path"
                            />
                          </div>
                          <label className="ps-detail-label" htmlFor="req-edit-headers">Headers</label>
                          <textarea
                            id="req-edit-headers"
                            className="ps-input ps-input-mono"
                            rows={5}
                            value={draft.headers}
                            onChange={event => setDraft({ ...draft, headers: event.target.value })}
                          />
                          <label className="ps-detail-label" htmlFor="req-edit-body">Body</label>
                          <textarea
                            id="req-edit-body"
                            className="ps-input ps-input-mono"
                            rows={8}
                            value={draft.body}
                            onChange={event => setDraft({ ...draft, body: event.target.value })}
                            disabled={['GET', 'HEAD'].includes(draft.method)}
                            placeholder={['GET', 'HEAD'].includes(draft.method) ? `${draft.method} requests have no body` : ''}
                          />
                          <div className="ps-req-editor-actions">
                            <span className="ps-settings-row-desc">
                              {localPortFor(selected, tunnels) ? `Sends to localhost:${localPortFor(selected, tunnels)}` : 'Start the share this request came through to send it'}
                            </span>
                            <button className="ps-btn ps-btn-ghost ps-btn-sm" onClick={() => { setDraft(null); setSendResult(null) }}>Cancel</button>
                            <button className="ps-btn ps-btn-primary ps-btn-sm" onClick={() => void sendDraft()} disabled={sending}>
                              {sending ? 'Sending…' : 'Send to my app'}
                            </button>
                          </div>
                          {sendResult && ('error' in sendResult ? (
                            <div className="ps-code" style={{ color: 'var(--red)' }}>{sendResult.error}</div>
                          ) : (
                            <div>
                              <div className="ps-detail-label">
                                Your app answered {sendResult.status} in {sendResult.durationMs} ms
                              </div>
                              <div className="ps-code" style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', maxHeight: 320, overflow: 'auto' }} dangerouslySetInnerHTML={{ __html: formatBody(sendResult.body) || 'Empty' }} />
                            </div>
                          ))}
                        </div>
                      )}
                      {!draft && activeTab === 'headers' && (
                        <div>
                          <div className="ps-detail-label">Request headers</div>
                          <HeaderList headers={selected.headers} showSensitive={showSensitive} empty="No headers recorded" />
                        </div>
                      )}
                      {!draft && activeTab === 'body' && (
                        <div>
                          <div className="ps-detail-label">Request body</div>
                          {selected.method === 'GET' ? (
                            <div className="ps-code" style={{ color: 'var(--text-soft)' }}>GET requests have no body</div>
                          ) : (
                            <div className="ps-code" style={{ whiteSpace: 'pre' }} dangerouslySetInnerHTML={{ __html: formatBody(redactBody(selected.body, showSensitive)) || 'Empty' }} />
                          )}
                        </div>
                      )}
                      {!draft && activeTab === 'response' && (
                        <>
                          <div>
                            <div className="ps-detail-label">Response headers</div>
                            <HeaderList headers={selected.responseHeaders} showSensitive={showSensitive} empty="No response headers recorded" />
                          </div>
                          <div>
                            <div className="ps-detail-label">Response body</div>
                            <div className="ps-code" style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }} dangerouslySetInnerHTML={{ __html: formatBody(redactBody(selected.responseBody, showSensitive)) || 'Empty' }} />
                          </div>
                        </>
                      )}
                    </div>
                  </>
                ) : (
                  <div className="ps-empty" style={{ flex: 1 }}>
                    <span className="ps-empty-title">Select a request</span>
                    <span className="ps-empty-sub">Pick one from the list to see its headers, body and response.</span>
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
