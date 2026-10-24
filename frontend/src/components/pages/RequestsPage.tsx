import { useMemo, useState } from 'react'
import type { RequestLogEntry } from '../../lib/api'
import { isNoiseRequestPath } from '../../lib/tunnel'

type Props = {
  requestLog: RequestLogEntry[]
  onClear: () => void
  retention: number
  onRetentionChange: (value: number) => void
  publicUrl: string
}

type DetailTab = 'headers' | 'body' | 'response'

const DETAIL_TABS: { id: DetailTab; label: string }[] = [
  { id: 'headers', label: 'Headers' },
  { id: 'body', label: 'Body' },
  { id: 'response', label: 'Response' },
]

function methodClass(method: string) {
  return `method-tag method-tag-${method.toLowerCase()}`
}

function statusClass(status: number | null) {
  if (!status) return ''
  if (status < 300) return 'status-2xx'
  if (status < 400) return 'status-3xx'
  if (status < 500) return 'status-4xx'
  return 'status-5xx'
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

const SENSITIVE_HEADERS = /authorization|cookie|set-cookie|proxy-authorization|x-api-key|x-auth-token/i

function escapeHtml(value: string) {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function syntaxHighlightJSON(json: string) {
  return escapeHtml(json).replace(/(("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+-]?\d+)?))/g, (match) => {
    let cls = 'var(--blue)'
    if (/^"/.test(match)) {
      if (/:$/.test(match)) { cls = 'var(--text)' }
      else { cls = 'var(--green)' }
    } else if (/true|false/.test(match)) {
      cls = 'var(--yellow)'
    } else if (/null/.test(match)) {
      cls = 'var(--red)'
    }
    return `<span style="color: ${cls}">${match}</span>`
  })
}

function formatBody(body: string | undefined) {
  if (!body) return ''
  try { return syntaxHighlightJSON(JSON.stringify(JSON.parse(body), null, 2)) } catch { return escapeHtml(body) }
}

function redactHeaders(headers: Record<string, string> | undefined, showSensitive: boolean) {
  return Object.entries(headers ?? {}).map(([key, value]) => [key, !showSensitive && SENSITIVE_HEADERS.test(key) ? '[hidden]' : value] as const)
}

function shellQuote(value: string) {
  return `'${value.replace(/'/g, `'\\''`)}'`
}

function curlCommand(entry: RequestLogEntry, base: string) {
  const headers = Object.entries(entry.headers ?? {})
    .filter(([key]) => !['host', 'x-forwarded-host'].includes(key.toLowerCase()))
    .map(([key, value]) => ` -H ${shellQuote(`${key}: ${value}`)}`).join('')
  const body = entry.body ? ` --data-raw ${shellQuote(entry.body)}` : ''
  return `curl -X ${entry.method}${headers}${body} ${shellQuote(base.replace(/\/$/, '') + entry.path)}`
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

export default function RequestsPage({ requestLog, onClear, retention, onRetentionChange, publicUrl }: Props) {
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
    const host = Object.entries(entry?.headers ?? {}).find(([key]) => ['x-forwarded-host', 'host'].includes(key.toLowerCase()))?.[1]
    return host ? `https://${host}` : publicUrl
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

  const methods = useMemo(() => [...new Set(requestLog.map(entry => entry.method))].sort(), [requestLog])
  const displayLog = requestLog.filter(entry => {
    if (!showFrameworkRequests && isNoiseRequestPath(entry.path)) return false
    if (methodFilter !== 'all' && entry.method !== methodFilter) return false
    if (statusFilter !== 'all' && !String(entry.status ?? '').startsWith(statusFilter)) return false
    return !search.trim() || `${entry.method} ${entry.path}`.toLowerCase().includes(search.trim().toLowerCase())
  })

  const copyCurl = async () => {
    if (!selected) return
    await navigator.clipboard.writeText(curlCommand(selected, replayBase(selected)))
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1500)
  }

  const copyLink = async () => {
    if (!publicUrl) return
    await navigator.clipboard.writeText(publicUrl).catch(() => {})
    setLinkCopied(true)
    window.setTimeout(() => setLinkCopied(false), 1500)
  }

  const hasRequests = requestLog.length > 0

  return (
    <div className="ps-main ps-requests-main">
      <div className="ps-page-header animate-fade-down">
        <div>
          <h1 className="ps-page-title">Requests</h1>
          <p className="ps-page-subtitle">
            {hasRequests
              ? `${displayLog.length} of ${requestLog.length} shown`
              : 'Live traffic coming through your link'}
          </p>
        </div>
        <div className="ps-header-actions">
          <label className="ps-req-retention">
            Keep last
            <select value={retention} onChange={event => onRetentionChange(Number(event.target.value))}>
              <option value={50}>50</option>
              <option value={100}>100</option>
              <option value={250}>250</option>
            </select>
          </label>
          <button className="ps-btn ps-btn-secondary ps-btn-sm" onClick={onClear} disabled={!hasRequests}>
            Clear
          </button>
        </div>
      </div>

      <div className="ps-requests-body animate-fade-up">
        {!hasRequests ? (
          <div className="ps-card ps-req-empty-card">
            <span className="ps-empty-title">No requests yet</span>
            <span className="ps-empty-sub">Open your link in a browser and each request will show up here.</span>
            {publicUrl && (
              <div className="ps-req-empty-link">
                <span className="ps-req-empty-url">{publicUrl}</span>
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
                <input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search by path" />
              </div>
              <select value={methodFilter} onChange={event => setMethodFilter(event.target.value)} aria-label="Method">
                <option value="all">All methods</option>
                {methods.map(method => <option key={method} value={method}>{method}</option>)}
              </select>
              <select value={statusFilter} onChange={event => setStatusFilter(event.target.value)} aria-label="Status">
                <option value="all">All statuses</option>
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
                Show sensitive headers
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
                      onClick={() => setSelected(entry)}
                      style={{ animationDelay: `${Math.min(i * 20, 200)}ms` }}
                    >
                      <span className={methodClass(entry.method)}>{entry.method}</span>
                      <span className="ps-req-path">{entry.path}</span>
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
                        <span className="ps-detail-path" title={selected.path}>{selected.path}</span>
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
                      {activeTab === 'headers' && (
                        <div>
                          <div className="ps-detail-label">Request headers</div>
                          <HeaderList headers={selected.headers} showSensitive={showSensitive} empty="No headers recorded" />
                        </div>
                      )}
                      {activeTab === 'body' && (
                        <div>
                          <div className="ps-detail-label">Request body</div>
                          {selected.method === 'GET' ? (
                            <div className="ps-code" style={{ color: 'var(--text-soft)' }}>GET requests have no body</div>
                          ) : (
                            <div className="ps-code" style={{ whiteSpace: 'pre' }} dangerouslySetInnerHTML={{ __html: formatBody(selected.body) || 'Empty' }} />
                          )}
                        </div>
                      )}
                      {activeTab === 'response' && (
                        <>
                          <div>
                            <div className="ps-detail-label">Response headers</div>
                            <HeaderList headers={selected.responseHeaders} showSensitive={showSensitive} empty="No response headers recorded" />
                          </div>
                          <div>
                            <div className="ps-detail-label">Response body</div>
                            <div className="ps-code" style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }} dangerouslySetInnerHTML={{ __html: formatBody(selected.responseBody) || 'Empty' }} />
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
