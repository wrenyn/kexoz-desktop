import type { PersistentTunnel, PreviewNote } from './api'
import { shareUrl } from './shares'

/** Builds a paste-ready prompt for Cursor / Claude Code from a feedback note. */
export function reproPromptForNote(tunnel: PersistentTunnel, note: PreviewNote): string {
  const page = `${shareUrl(tunnel)}${note.path.startsWith('/') ? note.path : `/${note.path}`}`
  const lines = [
    'Reproduce and fix this issue found on a Kexoz preview.',
    '',
    '## Feedback',
    note.body.trim() || '(no description)',
    '',
    '## Context',
    `- Preview URL: ${page}`,
    `- Share: ${tunnel.name?.trim() || tunnel.subdomain || tunnel.id}`,
    `- Local port: ${tunnel.port}`,
  ]
  if (note.target) lines.push(`- Element: \`${note.target.replace(/`/g, "'")}\``)
  const device = note.device
  if (device) {
    const viewport = device.viewportW && device.viewportH
      ? `${device.viewportW}×${device.viewportH}${device.pixelRatio && device.pixelRatio > 1 ? ` @${device.pixelRatio}x` : ''}`
      : ''
    lines.push(`- Browser: ${[device.browser, device.os, viewport].filter(Boolean).join(' · ')}`)
  }
  if (note.issueUrl) lines.push(`- Linked issue: ${note.issueUrl}`)
  const replies = (note.replies ?? []).filter(reply => reply.kind === 'comment')
  if (replies.length > 0) {
    lines.push('', '## Thread')
    for (const reply of replies) {
      lines.push(`- ${reply.author || 'Guest'}: ${reply.body.replace(/\n+/g, ' ')}`)
    }
  }
  lines.push(
    '',
    '## What to do',
    '1. Open the preview URL (or the matching local app) and reproduce the issue.',
    '2. Find the root cause in this codebase.',
    '3. Implement the fix and summarize what changed.',
  )
  return lines.join('\n')
}
