import type { NoteDevice, PersistentTunnel, PreviewApproval, PreviewNote, PreviewRevision, PreviewSnapshot } from './api'

export function timeAgo(iso: string): string {
  const seconds = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000))
  if (seconds < 60) return 'just now'
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours} h ago`
  return new Date(iso).toLocaleDateString()
}

export const revisionName = (revision: PreviewRevision | undefined): string =>
  revision ? `v${revision.number}${revision.label ? ` · ${revision.label}` : ''}` : ''

export function describeDevice(device: NoteDevice | undefined): string {
  if (!device) return ''
  const size = device.viewportW && device.viewportH
    ? `${device.viewportW}×${device.viewportH}${device.pixelRatio && device.pixelRatio > 1 ? ` @${Math.round(device.pixelRatio * 10) / 10}x` : ''}`
    : ''
  return [device.browser, device.os, size].filter(Boolean).join(' · ')
}

export type NoteBadge = { label: string; className: string }

export function noteBadges(note: PreviewNote, revisions: PreviewRevision[]): NoteBadge[] {
  const badges: NoteBadge[] = []
  if (note.status === 'resolved') {
    const fixedIn = revisions.find(revision => revision.id === note.resolvedRevisionId)
    badges.push({ label: fixedIn ? `Fixed in v${fixedIn.number}` : 'Fixed', className: 'ps-badge-green' })
    badges.push(note.verifiedAt ? { label: 'Confirmed', className: 'ps-badge-blue' } : { label: 'Waiting for the reviewer', className: 'ps-badge-gray' })
  } else if (note.status === 'in_progress') {
    badges.push({ label: 'In progress', className: 'ps-badge-blue' })
  } else {
    badges.push({ label: 'Open', className: 'ps-badge-gray' })
  }
  if (note.status !== 'resolved' && (note.reopenCount ?? 0) > 0) badges.push({ label: 'Reopened', className: 'ps-badge-yellow' })
  return badges
}

/** Where a note's pin falls in a screenshot, as fractions of its size, or null when it's outside. */
export function markerFor(shot: PreviewSnapshot, note: PreviewNote): { x: number; y: number } | null {
  if (note.pageX == null || note.pageY == null || !shot.width || !shot.height) return null
  // Page screenshots can be taken at another width than the note was left at.
  const ratio = shot.kind === 'page' && shot.viewportW && note.viewportW ? shot.viewportW / note.viewportW : 1
  const x = ((note.pageX * ratio - shot.originX) * shot.scale) / shot.width
  const y = ((note.pageY - shot.originY) * shot.scale) / shot.height
  if (x < 0 || x > 1 || y < 0 || y > 1) return null
  return { x, y }
}

const pagePath = (path: string) => path.split('#')[0] || '/'

/** The page screenshot from the revision that fixed the note, for a before-and-after view. */
export function afterShot(note: PreviewNote, revisions: PreviewRevision[]): { shot: PreviewSnapshot; revision: PreviewRevision } | null {
  if (note.status !== 'resolved') return null
  const revision = revisions.find(item => item.id === note.resolvedRevisionId)
  if (!revision) return null
  const shot = revision.snapshots.find(item => item.path === note.path) ?? revision.snapshots.find(item => item.path === pagePath(note.path))
  return shot ? { shot, revision } : null
}

/** The local port that serves a path, following the share's path routes. */
export function portForPath(tunnel: PersistentTunnel, path: string): number {
  let best = { length: -1, port: tunnel.port }
  for (const route of tunnel.pathRoutes ?? []) {
    const prefix = route.path.replace(/\/+$/, '')
    if (prefix === '') continue
    if ((path === prefix || path.startsWith(`${prefix}/`) || path.startsWith(`${prefix}?`)) && prefix.length > best.length) {
      best = { length: prefix.length, port: route.port }
    }
  }
  return best.port
}

/** Each reviewer's latest decision on a revision. */
export function latestDecisions(revision: PreviewRevision): PreviewApproval[] {
  const byPerson = new Map<string, PreviewApproval>()
  for (const approval of revision.approvals) byPerson.set(approval.authorKey || approval.author, approval)
  return [...byPerson.values()]
}

export function approvalSummary(revision: PreviewRevision): { approved: number; changes: number; label: string; className: string } {
  const latest = latestDecisions(revision)
  const approved = latest.filter(item => item.decision === 'approved').length
  const changes = latest.length - approved
  if (changes > 0) return { approved, changes, label: 'Changes requested', className: 'ps-badge-yellow' }
  if (approved > 0) return { approved, changes, label: approved === 1 ? 'Approved' : `Approved by ${approved}`, className: 'ps-badge-green' }
  return { approved, changes, label: 'Not reviewed yet', className: 'ps-badge-gray' }
}

/** Pages worth capturing for a revision: the home page and wherever the fixed notes are. */
export function pagesToCapture(notes: PreviewNote[]): string[] {
  const paths = new Set<string>(['/'])
  for (const note of notes) paths.add(pagePath(note.path))
  return [...paths].slice(0, 12)
}
