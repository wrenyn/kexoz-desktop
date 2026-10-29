export function methodClass(method: string) {
  return `method-tag method-tag-${method.toLowerCase()}`
}

export function statusClass(status: number | null | undefined) {
  if (!status) return ''
  if (status < 300) return 'status-2xx'
  if (status < 400) return 'status-3xx'
  if (status < 500) return 'status-4xx'
  return 'status-5xx'
}

export function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

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

/** HTML for a request or response body: highlighted when it is JSON, escaped otherwise. */
export function formatBody(body: string | undefined) {
  if (!body) return ''
  try { return syntaxHighlightJSON(JSON.stringify(JSON.parse(body), null, 2)) } catch { return escapeHtml(body) }
}
