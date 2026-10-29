export const HIDDEN = '[hidden]'
/** Square brackets in a URL would need escaping and trip curl's globbing. */
const HIDDEN_IN_URL = 'REDACTED'

const SENSITIVE_HEADER = /authorization|cookie|api-?key|auth-token|access-token|csrf|xsrf|session|secret|security-token/i
const SENSITIVE_FIELD = /^(password|passwd|pwd|pass|secret|client_secret|token|access_token|refresh_token|id_token|auth|authorization|api_?key|apikey|private_?key|session(_?id)?|sid|signature|sig|otp|card_?number|cvv|cvc|ssn|kexoz_access|kexoz_review)$/i
const SENSITIVE_FIELD_PART = /password|secret|token|api_?key|credential/i

export const sensitiveHeader = (name: string): boolean => SENSITIVE_HEADER.test(name)
export const sensitiveField = (name: string): boolean => SENSITIVE_FIELD.test(name) || SENSITIVE_FIELD_PART.test(name)

export function redactHeaders(headers: Record<string, string> | undefined, show: boolean): (readonly [string, string])[] {
  return Object.entries(headers ?? {}).map(([key, value]) => [key, !show && sensitiveHeader(key) ? HIDDEN : value] as const)
}

function redactForm(query: string): string {
  return query.split('&').map(pair => {
    const eq = pair.indexOf('=')
    if (eq < 0) return pair
    let name = pair.slice(0, eq)
    try { name = decodeURIComponent(name.replace(/\+/g, ' ')) } catch { /* keep the raw name */ }
    // OAuth puts one-time codes in the query string.
    return sensitiveField(name) || name === 'code' ? `${pair.slice(0, eq)}=${HIDDEN_IN_URL}` : pair
  }).join('&')
}

/** Hides the values of query parameters like ?token= and ?password=. */
export function redactPath(path: string, show: boolean): string {
  if (show) return path
  const mark = path.indexOf('?')
  if (mark < 0) return path
  const hash = path.indexOf('#', mark)
  const query = path.slice(mark + 1, hash < 0 ? undefined : hash)
  const rest = hash < 0 ? '' : path.slice(hash)
  return `${path.slice(0, mark)}?${redactForm(query)}${rest}`
}

function redactValue(value: unknown, depth: number): unknown {
  if (depth > 20 || value === null || typeof value !== 'object') return value
  if (Array.isArray(value)) return value.map(item => redactValue(item, depth + 1))
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, item]) =>
    [key, sensitiveField(key) && typeof item === 'string' ? HIDDEN : redactValue(item, depth + 1)]))
}

/** Hides password, token and similar fields in JSON and form bodies; other bodies pass through. */
export function redactBody(body: string | undefined, show: boolean): string | undefined {
  if (show || !body) return body
  const trimmed = body.trimStart()
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      return JSON.stringify(redactValue(JSON.parse(body), 0))
    } catch {
      return body
    }
  }
  if (/^[^\s=&]+=[^\s]*(&[^\s=&]+=[^\s]*)*$/.test(body.trim())) return redactForm(body.trim())
  return body
}
