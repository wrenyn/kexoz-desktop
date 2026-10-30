import type { PersistentTunnel, PreviewNote, PreviewRevision } from './api'
import { shareUrl } from './shares'

export type GitHubStatus = { connected: boolean; login: string; encrypted: boolean; error?: string }

export type GitHubLinkOption = { url: string; label: string; detail: string }

const REPOS_KEY = 'kexoz-github-repos'
const REPO_PATTERN = /^[\w.-]+\/[\w.-]+$/

export const githubAvailable = (): boolean => Boolean(window.kexoz?.githubRequest)

const request = <T,>(method: 'GET' | 'POST' | 'PATCH', path: string, body?: unknown): Promise<T> => {
  const call = window.kexoz?.githubRequest
  if (!call) return Promise.reject(new Error('GitHub works in the desktop app.'))
  return call<T>({ method, path, body })
}

export const githubStatus = async (): Promise<GitHubStatus> =>
  (await window.kexoz?.githubStatus?.()) ?? { connected: false, login: '', encrypted: false }

export const connectGitHub = async (token: string): Promise<GitHubStatus> => {
  const connect = window.kexoz?.githubConnect
  if (!connect) throw new Error('GitHub works in the desktop app.')
  return connect(token)
}

export const disconnectGitHub = async (): Promise<void> => {
  await window.kexoz?.githubDisconnect?.()
}

const readRepos = (): Record<string, string> => {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(REPOS_KEY) ?? '{}')
    return parsed && typeof parsed === 'object' ? parsed as Record<string, string> : {}
  } catch {
    return {}
  }
}

/** The repository a share's issues and fixes live in, as owner/name. */
export const repoForShare = (tunnelId: string): string => readRepos()[tunnelId] ?? ''

export const setRepoForShare = (tunnelId: string, repo: string): void => {
  const repos = readRepos()
  const clean = repo.trim().replace(/^https:\/\/github\.com\//, '').replace(/\.git$/, '').replace(/\/$/, '')
  if (clean) repos[tunnelId] = clean
  else delete repos[tunnelId]
  window.localStorage.setItem(REPOS_KEY, JSON.stringify(repos))
}

export const validRepo = (repo: string): boolean => REPO_PATTERN.test(repo)

export const listMyRepos = async (): Promise<string[]> => {
  const repos = await request<Array<{ full_name: string }>>('GET', '/user/repos?per_page=100&sort=pushed')
  return repos.map(repo => repo.full_name)
}

const deviceLine = (note: PreviewNote): string => {
  const device = note.device
  if (!device) return ''
  return [device.browser, device.os, device.viewportW && device.viewportH ? `${device.viewportW}×${device.viewportH}${device.pixelRatio && device.pixelRatio > 1 ? ` @${device.pixelRatio}x` : ''}` : '']
    .filter(Boolean).join(' · ')
}

const quote = (text: string): string => text.split('\n').map(line => `> ${line}`).join('\n')

/** Opens an issue for a note, with where it is and what the reviewer saw. */
export const createIssueForNote = async (repo: string, tunnel: PersistentTunnel, note: PreviewNote): Promise<string> => {
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
  const issue = await request<{ html_url: string }>('POST', `/repos/${repo}/issues`, { title, body: lines.join('\n') })
  return issue.html_url
}

const ISSUE_URL = /^https:\/\/github\.com\/([\w.-]+\/[\w.-]+)\/issues\/(\d+)/

/** Comments on a note's linked issue that it's fixed, and closes it. */
export const closeIssueAsFixed = async (issueUrl: string, revision: PreviewRevision): Promise<boolean> => {
  const match = ISSUE_URL.exec(issueUrl)
  if (!match) return false
  const [, repo, number] = match
  const links = revision.links.map(link => link.url).join(', ')
  const body = `Fixed in v${revision.number}${revision.label ? ` · ${revision.label}` : ''}${links ? ` (${links})` : ''}. Reviewers can confirm it on the preview.`
  await request('POST', `/repos/${repo}/issues/${number}/comments`, { body })
  await request('PATCH', `/repos/${repo}/issues/${number}`, { state: 'closed', state_reason: 'completed' })
  return true
}

/** Recent pull requests and commits to attach to a revision. */
export const recentChanges = async (repo: string): Promise<GitHubLinkOption[]> => {
  const [pulls, commits] = await Promise.all([
    request<Array<{ html_url: string; number: number; title: string; state: string; merged_at: string | null }>>('GET', `/repos/${repo}/pulls?state=all&per_page=8&sort=updated&direction=desc`),
    request<Array<{ html_url: string; sha: string; commit: { message: string } }>>('GET', `/repos/${repo}/commits?per_page=8`),
  ])
  return [
    ...pulls.map(pull => ({ url: pull.html_url, label: `#${pull.number} ${pull.title}`, detail: pull.merged_at ? 'Merged' : pull.state === 'open' ? 'Open pull request' : 'Closed' })),
    ...commits.map(commit => ({ url: commit.html_url, label: commit.commit.message.split('\n')[0], detail: commit.sha.slice(0, 7) })),
  ]
}
