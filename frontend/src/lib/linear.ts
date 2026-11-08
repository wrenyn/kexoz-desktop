import type { PersistentTunnel, PreviewNote, PreviewRevision } from './api'
import { shareUrl } from './shares'

export type LinearStatus = { connected: boolean; name: string; encrypted: boolean; error?: string }

export type LinearTeam = { id: string; key: string; name: string }

const TEAMS_KEY = 'kexoz-linear-teams'

export const linearAvailable = (): boolean => Boolean(window.kexoz?.linearRequest)

const request = <T,>(query: string, variables?: Record<string, unknown>): Promise<T> => {
  const call = window.kexoz?.linearRequest
  if (!call) return Promise.reject(new Error('Linear works in the desktop app.'))
  return call<T>({ query, variables })
}

export const linearStatus = async (): Promise<LinearStatus> =>
  (await window.kexoz?.linearStatus?.()) ?? { connected: false, name: '', encrypted: false }

export const connectLinear = async (token: string): Promise<LinearStatus> => {
  const connect = window.kexoz?.linearConnect
  if (!connect) throw new Error('Linear works in the desktop app.')
  return connect(token)
}

export const disconnectLinear = async (): Promise<void> => {
  await window.kexoz?.linearDisconnect?.()
}

const readTeams = (): Record<string, string> => {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(TEAMS_KEY) ?? '{}')
    return parsed && typeof parsed === 'object' ? parsed as Record<string, string> : {}
  } catch {
    return {}
  }
}

/** Linear team id chosen for a share's issues. */
export const teamForShare = (tunnelId: string): string => readTeams()[tunnelId] ?? ''

export const setTeamForShare = (tunnelId: string, teamId: string): void => {
  const teams = readTeams()
  const clean = teamId.trim()
  if (clean) teams[tunnelId] = clean
  else delete teams[tunnelId]
  window.localStorage.setItem(TEAMS_KEY, JSON.stringify(teams))
}

export const validTeamId = (value: string): boolean => /^[0-9a-f-]{36}$/i.test(value.trim())

export const listLinearTeams = async (): Promise<LinearTeam[]> => {
  const data = await request<{ teams: { nodes: LinearTeam[] } }>(
    `query { teams { nodes { id key name } } }`,
  )
  return data.teams?.nodes ?? []
}

const quote = (text: string): string => text.split('\n').map(line => `> ${line}`).join('\n')

const deviceLine = (note: PreviewNote): string => {
  const device = note.device
  if (!device) return ''
  return [device.browser, device.os, device.viewportW && device.viewportH ? `${device.viewportW}×${device.viewportH}${device.pixelRatio && device.pixelRatio > 1 ? ` @${device.pixelRatio}x` : ''}` : '']
    .filter(Boolean).join(' · ')
}

/** Creates a Linear issue for a note and returns its URL. */
export const createLinearIssueForNote = async (teamId: string, tunnel: PersistentTunnel, note: PreviewNote): Promise<string> => {
  const page = `${shareUrl(tunnel)}${note.path.startsWith('/') ? note.path : `/${note.path}`}`
  const lines = [
    quote(note.body),
    '',
    `**From:** ${note.author || 'Guest'}`,
    `**Page:** ${page}`,
  ]
  if (note.target) lines.push(`**Element:** \`${note.target.replace(/`/g, "'")}\``)
  const device = deviceLine(note)
  if (device) lines.push(`**Browser:** ${device}`)
  const replies = (note.replies ?? []).filter(reply => reply.kind === 'comment')
  if (replies.length > 0) {
    lines.push('', '**Thread**')
    for (const reply of replies) lines.push(`- ${reply.author}: ${reply.body.replace(/\n+/g, ' ')}`)
  }
  lines.push('', '_Left on a Kexoz preview._')
  const firstLine = note.body.split('\n')[0].trim()
  const title = firstLine.length > 90 ? `${firstLine.slice(0, 87)}…` : firstLine || 'Preview feedback'
  const data = await request<{ issueCreate: { success: boolean; issue: { url: string } | null } }>(
    `mutation IssueCreate($input: IssueCreateInput!) {
      issueCreate(input: $input) { success issue { url } }
    }`,
    { input: { teamId, title, description: lines.join('\n') } },
  )
  const url = data.issueCreate?.issue?.url
  if (!data.issueCreate?.success || !url) throw new Error('Linear did not create the issue.')
  return url
}

const LINEAR_ISSUE = /^https:\/\/linear\.app\/[\w-]+\/issue\/([\w-]+)/i

/** Marks a linked Linear issue done when a revision ships. */
export const completeLinearIssue = async (issueUrl: string, revision: PreviewRevision): Promise<boolean> => {
  const match = LINEAR_ISSUE.exec(issueUrl)
  if (!match) return false
  const identifier = match[1]
  const lookup = await request<{ issue: { id: string } | null }>(
    `query ($id: String!) { issue(id: $id) { id } }`,
    { id: identifier },
  )
  const issueId = lookup.issue?.id
  if (!issueId) return false
  const states = await request<{ workflowStates: { nodes: Array<{ id: string; type: string }> } }>(
    `query { workflowStates { nodes { id type } } }`,
  )
  const done = states.workflowStates?.nodes.find(state => state.type === 'completed')
  if (!done) return false
  const links = revision.links.map(link => link.url).join(', ')
  const body = `Fixed in v${revision.number}${revision.label ? ` · ${revision.label}` : ''}${links ? ` (${links})` : ''}. Reviewers can confirm it on the preview.`
  await request(
    `mutation CommentCreate($input: CommentCreateInput!) { commentCreate(input: $input) { success } }`,
    { input: { issueId, body } },
  )
  await request(
    `mutation IssueUpdate($id: String!, $input: IssueUpdateInput!) { issueUpdate(id: $id, input: $input) { success } }`,
    { id: issueId, input: { stateId: done.id } },
  )
  return true
}
