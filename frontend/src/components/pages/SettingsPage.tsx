import { useCallback, useEffect, useState } from 'react'
import { toast } from 'react-hot-toast'
import {
  captureInstall, deleteIntegration, listIntegrations, saveIntegration, testIntegration,
  type ClientSession, type IntegrationProvider, type WorkspaceIntegration,
} from '../../lib/api'
import { useCopy } from '../../hooks/useCopy'
import type { Theme } from '../../hooks/useTheme'
import GitHubModal from '../review/GitHubModal'
import LinearModal from '../review/LinearModal'
import { disconnectGitHub, githubAvailable, githubStatus, setRepoForShare, type GitHubStatus } from '../../lib/github'
import { disconnectLinear, linearAvailable, linearStatus, setTeamForShare, type LinearStatus } from '../../lib/linear'
import { extractError } from '../../lib/utils'
import LoadingBlock from '../ui/LoadingBlock'
import LoadError from '../ui/LoadError'
import { Monitor, Moon, Sun } from 'lucide-react'

type Props = {
  session: ClientSession
  theme: Theme
  onThemeChange: (theme: Theme) => void
  onVerify: () => void
  verifying: boolean
  gauthEnabled: boolean
  onSignOut: () => void
  onOpenTeam?: () => void
  onOpenAccount?: () => void
}

type Section = 'appearance' | 'capture' | 'alerts' | 'integrations' | 'developer'

const SECTIONS: { id: Section; label: string }[] = [
  { id: 'appearance', label: 'Appearance' },
  { id: 'capture', label: 'Capture' },
  { id: 'alerts', label: 'Alerts' },
  { id: 'integrations', label: 'Integrations' },
  { id: 'developer', label: 'Developer' },
]

const DESKTOP_NOTIFY_KEY = 'kexoz-notify-desktop'
const ASSIGNMENT_NOTIFY_KEY = 'kexoz-notify-assignment'
const EVENT_OPTIONS = [
  { id: 'feedback', label: 'Feedback' },
  { id: 'assignment', label: 'Assignments' },
  { id: 'review', label: 'Review' },
  { id: 'down', label: 'Down alerts' },
] as const

type WebhookProvider = Extract<IntegrationProvider, 'slack' | 'discord' | 'teams' | 'google_chat'>

const WEBHOOK_PLACEHOLDERS: Record<WebhookProvider, string> = {
  slack: 'https://hooks.slack.com/services/…',
  discord: 'https://discord.com/api/webhooks/…',
  teams: 'https://outlook.office.com/webhook/…',
  google_chat: 'https://chat.googleapis.com/v1/spaces/…/messages?key=…&token=…',
}

const WEBHOOK_TITLES: Record<WebhookProvider, string> = {
  slack: 'Slack',
  discord: 'Discord',
  teams: 'Microsoft Teams',
  google_chat: 'Google Chat',
}

function readFlag(key: string, fallback = true) {
  try {
    const raw = window.localStorage.getItem(key)
    if (raw == null) return fallback
    return raw === '1' || raw === 'true'
  } catch {
    return fallback
  }
}

function writeFlag(key: string, value: boolean) {
  try {
    window.localStorage.setItem(key, value ? '1' : '0')
  } catch {
    // ignore
  }
}

export default function SettingsPage({ session, theme, onThemeChange }: Props) {
  const [section, setSection] = useState<Section>(() => {
    try {
      const stored = window.sessionStorage.getItem('kexoz-settings-section')
      window.sessionStorage.removeItem('kexoz-settings-section')
      if (stored === 'capture' || stored === 'integrations' || stored === 'appearance' || stored === 'alerts' || stored === 'developer') {
        return stored
      }
    } catch { /* ignore */ }
    return 'appearance'
  })
  const [desktopNotify, setDesktopNotify] = useState(() => readFlag(DESKTOP_NOTIFY_KEY, true))
  const [assignmentNotify, setAssignmentNotify] = useState(() => readFlag(ASSIGNMENT_NOTIFY_KEY, true))
  const { copied, copy } = useCopy()

  useEffect(() => { writeFlag(DESKTOP_NOTIFY_KEY, desktopNotify) }, [desktopNotify])
  useEffect(() => { writeFlag(ASSIGNMENT_NOTIFY_KEY, assignmentNotify) }, [assignmentNotify])

  return (
    <div className="ps-main">
      <div className="ps-page-header animate-fade-down">
        <div>
          <h1 className="ps-page-title">Settings</h1>
          <p className="ps-page-subtitle">Make Kexoz work the way you do. Changes save automatically unless a Save button is shown.</p>
        </div>
      </div>

      <div className="ps-page-content">
        <div className="ps-settings-layout animate-fade-up">
          <nav className="ps-settings-nav" aria-label="Settings sections">
            {SECTIONS.map(item => (
              <button
                key={item.id}
                type="button"
                className={`ps-settings-nav-item${section === item.id ? ' active' : ''}`}
                aria-current={section === item.id ? 'true' : undefined}
                onClick={() => setSection(item.id)}
              >
                {item.label}
              </button>
            ))}
          </nav>

          <div className="ps-settings-page animate-fade-in" key={section}>
            {section === 'appearance' && (
              <section className="ps-card ps-settings-section">
                <div className="ps-settings-section-title">Appearance</div>
                <p className="ps-section-description">Choose a comfortable theme for your workspace.</p>
                <div className="ps-settings-row">
                  <div className="ps-settings-row-info">
                    <div className="ps-settings-row-label">Theme</div>
                  </div>
                  <div className="ps-theme-options" role="radiogroup" aria-label="Theme">
                    {([
                      { id: 'dark', label: 'Dark' },
                      { id: 'light', label: 'Light' },
                    ] as const).map(option => (
                      <label
                        key={option.id}
                        className={`ps-theme-option ${option.id}${theme === option.id ? ' active' : ''}`}
                      >
                        <input type="radio" name="theme" value={option.id} checked={theme === option.id} onChange={() => onThemeChange(option.id)} />
                        <span className="ps-theme-preview" aria-hidden="true"><span /><span><i /><i /><i /></span></span>
                        <span className="ps-theme-label">{option.id === 'dark' ? <Moon size={14} aria-hidden="true" /> : <Sun size={14} aria-hidden="true" />}{option.label}<span className="ps-theme-check" aria-hidden="true" /></span>
                      </label>
                    ))}
                  </div>
                </div>
              </section>
            )}

            {section === 'capture' && (
              <section className="ps-card ps-settings-section">
                <div className="ps-settings-section-title">Capture</div>
                <p className="ps-settings-row-desc" style={{ marginBottom: 14, maxWidth: 520 }}>
                  Report a bug from your browser. Capture a screenshot or recording, add context, and send it to this workspace with console and network details.
                </p>
                <CaptureInstallRow onCopyExtensions={() => void copy('capture-ext', 'chrome://extensions')} copied={copied === 'capture-ext'} />
                <div className="ps-settings-row" style={{ alignItems: 'flex-start' }}>
                  <div className="ps-settings-row-info">
                    <div className="ps-settings-row-label">Sign in</div>
                    <div className="ps-settings-row-desc">
                      Open Capture from your browser toolbar and choose Continue with Google. If you received an invitation, choose I have an invite and paste your invitation token.
                    </div>
                  </div>
                </div>
                <div className="ps-settings-row" style={{ alignItems: 'flex-start' }}>
                  <div className="ps-settings-row-info">
                    <div className="ps-settings-row-label">Guests</div>
                    <div className="ps-settings-row-desc">
                      Open Feedback, choose a share, and select More → Capture invite. Send the invitation link to your reviewer.
                    </div>
                  </div>
                </div>
              </section>
            )}

            {section === 'alerts' && (
              <section className="ps-card ps-settings-section">
                <div className="ps-settings-section-title">Alerts</div>
                <p className="ps-section-description">Choose which notifications you receive on this computer.</p>
                <ToggleRow label="Desktop notifications" description="Show desktop alerts when new feedback arrives." checked={desktopNotify} onChange={setDesktopNotify} />
                <ToggleRow label="Assignment notifications" description="Notify you when a feedback item is assigned to you." checked={assignmentNotify} onChange={setAssignmentNotify} />
              </section>
            )}

            {section === 'integrations' && (
              <IntegrationsSection clientId={session.id} />
            )}

            {section === 'developer' && (
              <section className="ps-card ps-settings-section">
                <div className="ps-settings-section-title">Developer</div>
                <div className="ps-settings-row">
                  <div className="ps-settings-row-info">
                    <div className="ps-settings-row-label">Client ID</div>
                    <div className="ps-settings-row-desc" style={{ fontFamily: 'var(--font-mono)', wordBreak: 'break-all' }}>
                      {session.id}
                    </div>
                    <div className="ps-settings-row-desc" style={{ marginTop: 6 }}>
                      Identifies this workspace when connecting the Kexoz CLI. Treat it as private.
                    </div>
                  </div>
                  <button
                    type="button"
                    className="ps-btn ps-btn-secondary ps-btn-sm"
                    onClick={() => void copy('client-id', session.id)}
                  >
                    {copied === 'client-id' ? 'Copied' : 'Copy'}
                  </button>
                </div>
                <div className="ps-settings-section-title ps-shortcuts-title"><Monitor size={14} aria-hidden="true" /> Keyboard shortcuts</div>
                <div className="ps-shortcut-row"><span>New share</span><kbd>Ctrl / ⌘ + N</kbd></div>
                <div className="ps-shortcut-row"><span>Switch pages in sidebar order</span><kbd>Ctrl / ⌘ + 1–8</kbd></div>
                <div className="ps-shortcut-row"><span>Close a dialog</span><kbd>Esc</kbd></div>
              </section>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function IntegrationsSection({ clientId }: { clientId: string }) {
  const [rows, setRows] = useState<WorkspaceIntegration[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [slackUrl, setSlackUrl] = useState('')
  const [discordUrl, setDiscordUrl] = useState('')
  const [teamsUrl, setTeamsUrl] = useState('')
  const [gchatUrl, setGchatUrl] = useState('')
  const [slackEvents, setSlackEvents] = useState<string[]>(['feedback', 'assignment', 'review', 'down'])
  const [discordEvents, setDiscordEvents] = useState<string[]>(['feedback', 'assignment', 'review', 'down'])
  const [teamsEvents, setTeamsEvents] = useState<string[]>(['feedback', 'assignment', 'review', 'down'])
  const [gchatEvents, setGchatEvents] = useState<string[]>(['feedback', 'assignment', 'review', 'down'])
  const [jiraBaseUrl, setJiraBaseUrl] = useState('')
  const [jiraEmail, setJiraEmail] = useState('')
  const [jiraApiToken, setJiraApiToken] = useState('')
  const [jiraProjectKey, setJiraProjectKey] = useState('')
  const [linearApiToken, setLinearApiToken] = useState('')
  const [linearTeamId, setLinearTeamId] = useState('')
  const [githubApiToken, setGithubApiToken] = useState('')
  const [githubRepo, setGithubRepo] = useState('')
  const [busy, setBusy] = useState('')
  const [ghStatus, setGhStatus] = useState<GitHubStatus>({ connected: false, login: '', encrypted: false })
  const [lnStatus, setLnStatus] = useState<LinearStatus>({ connected: false, name: '', encrypted: false })
  const [showGh, setShowGh] = useState(false)
  const [showLn, setShowLn] = useState(false)

  const refresh = useCallback(async () => {
    setLoading(true)
    setLoadError('')
    try {
      const list = await listIntegrations(clientId)
      setRows(list)
      const slack = list.find(item => item.provider === 'slack')
      const discord = list.find(item => item.provider === 'discord')
      const teams = list.find(item => item.provider === 'teams')
      const gchat = list.find(item => item.provider === 'google_chat')
      const jira = list.find(item => item.provider === 'jira')
      const linear = list.find(item => item.provider === 'linear')
      const github = list.find(item => item.provider === 'github')
      if (slack?.events?.length) setSlackEvents(slack.events)
      if (discord?.events?.length) setDiscordEvents(discord.events)
      if (teams?.events?.length) setTeamsEvents(teams.events)
      if (gchat?.events?.length) setGchatEvents(gchat.events)
      if (jira?.config) {
        setJiraBaseUrl(jira.config.baseUrl ?? '')
        setJiraEmail(jira.config.email ?? '')
        setJiraProjectKey(jira.config.projectKey ?? '')
      }
      if (linear?.config) {
        setLinearTeamId(linear.config.teamId ?? '')
      }
      if (github?.config?.repo) {
        setGithubRepo(github.config.repo)
      }
    } catch (err) {
      setLoadError(extractError(err))
    } finally {
      setLoading(false)
    }
  }, [clientId])

  useEffect(() => { void refresh() }, [refresh])
  useEffect(() => {
    if (githubAvailable()) void githubStatus().then(setGhStatus).catch(() => {})
    if (linearAvailable()) void linearStatus().then(setLnStatus).catch(() => {})
  }, [])

  const slack = rows.find(item => item.provider === 'slack')
  const discord = rows.find(item => item.provider === 'discord')
  const teams = rows.find(item => item.provider === 'teams')
  const gchat = rows.find(item => item.provider === 'google_chat')
  const jira = rows.find(item => item.provider === 'jira')
  const linear = rows.find(item => item.provider === 'linear')
  const github = rows.find(item => item.provider === 'github')
  const jiraConnected = Boolean(
    jira?.config?.hasApiToken
    && jira.config?.baseUrl
    && jira.config?.email
    && jira.config?.projectKey,
  )
  const linearConnected = Boolean(linear?.config?.hasApiToken && linear.config?.teamId)
  const githubConnected = Boolean(github?.config?.hasApiToken && github.config?.repo)

  const webhookDraft = (provider: WebhookProvider) => {
    if (provider === 'slack') return slackUrl
    if (provider === 'discord') return discordUrl
    if (provider === 'google_chat') return gchatUrl
    return teamsUrl
  }

  const clearWebhookDraft = (provider: WebhookProvider) => {
    if (provider === 'slack') setSlackUrl('')
    else if (provider === 'discord') setDiscordUrl('')
    else if (provider === 'google_chat') setGchatUrl('')
    else setTeamsUrl('')
  }

  const webhookEvents = (provider: WebhookProvider) => {
    if (provider === 'slack') return slackEvents
    if (provider === 'discord') return discordEvents
    if (provider === 'google_chat') return gchatEvents
    return teamsEvents
  }

  const saveWebhook = async (provider: WebhookProvider) => {
    const webhookUrl = webhookDraft(provider).trim()
    if (!webhookUrl) {
      toast.error('Paste a webhook URL first.')
      return
    }
    setBusy(provider)
    try {
      await saveIntegration(clientId, provider, {
        webhookUrl,
        events: webhookEvents(provider),
        enabled: true,
      })
      clearWebhookDraft(provider)
      toast.success(`${WEBHOOK_TITLES[provider]} connected`)
      await refresh()
    } catch (err) {
      toast.error(extractError(err))
    } finally {
      setBusy('')
    }
  }

  const saveJira = async () => {
    const baseUrl = jiraBaseUrl.trim()
    const email = jiraEmail.trim()
    const projectKey = jiraProjectKey.trim()
    const apiToken = jiraApiToken.trim()
    if (!baseUrl || !email || !projectKey) {
      toast.error('Base URL, email, and project key are required.')
      return
    }
    if (!jiraConnected && !apiToken) {
      toast.error('Paste an API token first.')
      return
    }
    setBusy('jira')
    try {
      await saveIntegration(clientId, 'jira', {
        enabled: true,
        config: {
          baseUrl,
          email,
          projectKey,
          ...(apiToken ? { apiToken } : {}),
        },
      })
      setJiraApiToken('')
      toast.success('Jira connected')
      await refresh()
    } catch (err) {
      toast.error(extractError(err))
    } finally {
      setBusy('')
    }
  }

  const saveGithub = async () => {
    const repo = githubRepo.trim()
    const apiToken = githubApiToken.trim()
    if (!repo) {
      toast.error('GitHub repo must be owner/name.')
      return
    }
    if (!githubConnected && !apiToken) {
      toast.error('Paste a GitHub personal access token first.')
      return
    }
    setBusy('github')
    try {
      await saveIntegration(clientId, 'github', {
        enabled: true,
        events: ['feedback'],
        config: {
          repo,
          ...(apiToken ? { apiToken } : {}),
        },
      })
      setGithubApiToken('')
      toast.success('GitHub connected')
      await refresh()
    } catch (err) {
      toast.error(extractError(err))
    } finally {
      setBusy('')
    }
  }

  const saveLinear = async () => {
    const teamId = linearTeamId.trim()
    const apiToken = linearApiToken.trim()
    if (!teamId) {
      toast.error('Linear team id is required.')
      return
    }
    if (!linearConnected && !apiToken) {
      toast.error('Paste a Linear API key first.')
      return
    }
    setBusy('linear')
    try {
      await saveIntegration(clientId, 'linear', {
        enabled: true,
        events: ['feedback'],
        config: {
          teamId,
          ...(apiToken ? { apiToken } : {}),
        },
      })
      setLinearApiToken('')
      toast.success('Linear connected')
      await refresh()
    } catch (err) {
      toast.error(extractError(err))
    } finally {
      setBusy('')
    }
  }

  const disconnect = async (provider: IntegrationProvider) => {
    setBusy(`del-${provider}`)
    try {
      await deleteIntegration(clientId, provider)
      toast.success('Disconnected')
      if (provider === 'jira') {
        setJiraBaseUrl('')
        setJiraEmail('')
        setJiraApiToken('')
        setJiraProjectKey('')
      }
      if (provider === 'linear') {
        setLinearApiToken('')
        setLinearTeamId('')
      }
      if (provider === 'github') {
        setGithubApiToken('')
        setGithubRepo('')
      }
      await refresh()
    } catch (err) {
      toast.error(extractError(err))
    } finally {
      setBusy('')
    }
  }

  const test = async (provider: IntegrationProvider) => {
    setBusy(`test-${provider}`)
    try {
      await testIntegration(clientId, provider)
      toast.success(provider === 'jira' || provider === 'linear' ? 'Connection verified' : 'Test message sent')
    } catch (err) {
      toast.error(extractError(err))
    } finally {
      setBusy('')
    }
  }

  return (
    <>
      <section className="ps-card ps-settings-section">
        <div className="ps-settings-section-title">Workspace integrations</div>
        <p className="ps-section-description">Send feedback alerts to your team and create issues in your existing tools.</p>
        {loadError && <LoadError message={loadError} onRetry={() => void refresh()} />}
        {loading ? (
          <LoadingBlock label="Loading integrations" rows={3} compact />
        ) : loadError ? null : (
          <>
            <WebhookRow
              title="Slack"
              connected={Boolean(slack?.hasWebhook)}
              maskedUrl={slack?.webhookUrl}
              url={slackUrl}
              onUrl={setSlackUrl}
              events={slackEvents}
              onEvents={setSlackEvents}
              busy={busy}
              provider="slack"
              onSave={() => void saveWebhook('slack')}
              onTest={() => void test('slack')}
              onDisconnect={() => void disconnect('slack')}
            />
            <WebhookRow
              title="Discord"
              connected={Boolean(discord?.hasWebhook)}
              maskedUrl={discord?.webhookUrl}
              url={discordUrl}
              onUrl={setDiscordUrl}
              events={discordEvents}
              onEvents={setDiscordEvents}
              busy={busy}
              provider="discord"
              onSave={() => void saveWebhook('discord')}
              onTest={() => void test('discord')}
              onDisconnect={() => void disconnect('discord')}
            />
            <WebhookRow
              title={WEBHOOK_TITLES.teams}
              connected={Boolean(teams?.hasWebhook)}
              maskedUrl={teams?.webhookUrl}
              url={teamsUrl}
              onUrl={setTeamsUrl}
              events={teamsEvents}
              onEvents={setTeamsEvents}
              busy={busy}
              provider="teams"
              onSave={() => void saveWebhook('teams')}
              onTest={() => void test('teams')}
              onDisconnect={() => void disconnect('teams')}
            />
            <WebhookRow
              title={WEBHOOK_TITLES.google_chat}
              connected={Boolean(gchat?.hasWebhook)}
              maskedUrl={gchat?.webhookUrl}
              url={gchatUrl}
              onUrl={setGchatUrl}
              events={gchatEvents}
              onEvents={setGchatEvents}
              busy={busy}
              provider="google_chat"
              onSave={() => void saveWebhook('google_chat')}
              onTest={() => void test('google_chat')}
              onDisconnect={() => void disconnect('google_chat')}
            />
            <JiraRow
              connected={jiraConnected}
              hasApiToken={Boolean(jira?.config?.hasApiToken)}
              baseUrl={jiraBaseUrl}
              email={jiraEmail}
              apiToken={jiraApiToken}
              projectKey={jiraProjectKey}
              onBaseUrl={setJiraBaseUrl}
              onEmail={setJiraEmail}
              onApiToken={setJiraApiToken}
              onProjectKey={setJiraProjectKey}
              busy={busy}
              onSave={() => void saveJira()}
              onTest={() => void test('jira')}
              onDisconnect={() => void disconnect('jira')}
            />
            <GitHubServerRow
              connected={githubConnected}
              hasApiToken={Boolean(github?.config?.hasApiToken)}
              repo={githubRepo}
              apiToken={githubApiToken}
              onRepo={setGithubRepo}
              onApiToken={setGithubApiToken}
              busy={busy}
              onSave={() => void saveGithub()}
              onTest={() => void test('github')}
              onDisconnect={() => void disconnect('github')}
            />
            <LinearServerRow
              connected={linearConnected}
              hasApiToken={Boolean(linear?.config?.hasApiToken)}
              teamId={linearTeamId}
              apiToken={linearApiToken}
              onTeamId={setLinearTeamId}
              onApiToken={setLinearApiToken}
              busy={busy}
              onSave={() => void saveLinear()}
              onTest={() => void test('linear')}
              onDisconnect={() => void disconnect('linear')}
            />
          </>
        )}
      </section>

      <section className="ps-card ps-settings-section">
        <div className="ps-settings-section-title">Issues (desktop)</div>
        <p className="ps-settings-row-desc" style={{ marginBottom: 8 }}>
          Workspace GitHub above creates issues and closes them when a note is marked fixed. The desktop token below is only for attaching PRs and commits in Review.
        </p>
        <div className="ps-settings-row">
          <div className="ps-settings-row-info">
            <div className="ps-settings-row-label">GitHub</div>
            <div className="ps-settings-row-desc">
              {ghStatus.connected ? `Connected as ${ghStatus.login}` : 'Create issues from feedback threads'}
            </div>
          </div>
          <div className="ps-settings-row-actions">
            {ghStatus.connected ? (
              <button type="button" className="ps-btn ps-btn-ghost ps-btn-sm ps-btn-text-danger" onClick={() => void disconnectGitHub().then(() => setGhStatus({ connected: false, login: '', encrypted: false }))}>
                Disconnect
              </button>
            ) : null}
            <button type="button" className="ps-btn ps-btn-secondary ps-btn-sm" onClick={() => setShowGh(true)} disabled={!githubAvailable()}>
              {ghStatus.connected ? 'Manage' : 'Connect'}
            </button>
          </div>
        </div>
        <div className="ps-settings-row">
          <div className="ps-settings-row-info">
            <div className="ps-settings-row-label">Linear</div>
            <div className="ps-settings-row-desc">
              {lnStatus.connected ? `Connected as ${lnStatus.name}` : 'Create issues from feedback threads'}
            </div>
          </div>
          <div className="ps-settings-row-actions">
            {lnStatus.connected ? (
              <button type="button" className="ps-btn ps-btn-ghost ps-btn-sm ps-btn-text-danger" onClick={() => void disconnectLinear().then(() => setLnStatus({ connected: false, name: '', encrypted: false }))}>
                Disconnect
              </button>
            ) : null}
            <button type="button" className="ps-btn ps-btn-secondary ps-btn-sm" onClick={() => setShowLn(true)} disabled={!linearAvailable()}>
              {lnStatus.connected ? 'Manage' : 'Connect'}
            </button>
          </div>
        </div>
      </section>

      {showGh && (
        <GitHubModal
          status={ghStatus}
          repo=""
          shareName="Settings"
          onStatus={setGhStatus}
          onRepo={repo => setRepoForShare('default', repo)}
          onClose={() => setShowGh(false)}
        />
      )}
      {showLn && (
        <LinearModal
          status={lnStatus}
          teamId=""
          shareName="Settings"
          onStatus={setLnStatus}
          onTeam={teamId => setTeamForShare('default', teamId)}
          onClose={() => setShowLn(false)}
        />
      )}
    </>
  )
}

function WebhookRow({
  title, connected, maskedUrl, url, onUrl, events, onEvents, busy, provider, onSave, onTest, onDisconnect,
}: {
  title: string
  connected: boolean
  maskedUrl?: string
  url: string
  onUrl: (value: string) => void
  events: string[]
  onEvents: (value: string[]) => void
  busy: string
  provider: WebhookProvider
  onSave: () => void
  onTest: () => void
  onDisconnect: () => void
}) {
  const help = provider === 'teams'
    ? (connected ? `Connected · ${maskedUrl || 'webhook'}` : 'Incoming webhook or Power Automate URL')
    : provider === 'google_chat'
      ? (connected ? `Connected · ${maskedUrl || 'webhook'}` : 'Google Chat space incoming webhook URL')
      : (connected ? `Connected · ${maskedUrl || 'webhook'}` : 'Paste an Incoming Webhook URL')

  return (
    <div className="ps-settings-row" style={{ alignItems: 'flex-start', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', width: '100%', justifyContent: 'space-between', gap: 12 }}>
        <div className="ps-settings-row-info">
          <div className="ps-settings-row-label">{title}</div>
          <div className="ps-settings-row-desc">{help}</div>
        </div>
        <div className="ps-settings-row-actions">
          {connected && (
            <>
              <button type="button" className="ps-btn ps-btn-secondary ps-btn-sm" disabled={Boolean(busy)} onClick={onTest}>
                {busy === `test-${provider}` ? 'Sending…' : 'Send test'}
              </button>
              <button type="button" className="ps-btn ps-btn-ghost ps-btn-sm ps-btn-text-danger" disabled={Boolean(busy)} onClick={onDisconnect}>
                Disconnect
              </button>
            </>
          )}
        </div>
      </div>
      <input
        className="ps-input"
        style={{ width: '100%' }}
        type="url"
        placeholder={WEBHOOK_PLACEHOLDERS[provider]}
        value={url}
        onChange={event => onUrl(event.target.value)}
      />
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
        {EVENT_OPTIONS.map(option => (
          <label key={option.id} style={{ display: 'inline-flex', gap: 6, alignItems: 'center', fontSize: 12 }}>
            <input
              type="checkbox"
              checked={events.includes(option.id)}
              onChange={event => {
                onEvents(event.target.checked
                  ? [...new Set([...events, option.id])]
                  : events.filter(item => item !== option.id))
              }}
            />
            {option.label}
          </label>
        ))}
      </div>
      <button type="button" className="ps-btn ps-btn-primary ps-btn-sm" disabled={Boolean(busy) || !url.trim()} onClick={onSave}>
        {busy === provider ? 'Saving…' : connected ? 'Update webhook' : 'Save'}
      </button>
    </div>
  )
}

function JiraRow({
  connected, hasApiToken, baseUrl, email, apiToken, projectKey,
  onBaseUrl, onEmail, onApiToken, onProjectKey, busy, onSave, onTest, onDisconnect,
}: {
  connected: boolean
  hasApiToken: boolean
  baseUrl: string
  email: string
  apiToken: string
  projectKey: string
  onBaseUrl: (value: string) => void
  onEmail: (value: string) => void
  onApiToken: (value: string) => void
  onProjectKey: (value: string) => void
  busy: string
  onSave: () => void
  onTest: () => void
  onDisconnect: () => void
}) {
  const canSave = baseUrl.trim() && email.trim() && projectKey.trim() && (connected ? true : apiToken.trim())

  return (
    <div className="ps-settings-row" style={{ alignItems: 'flex-start', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', width: '100%', justifyContent: 'space-between', gap: 12 }}>
        <div className="ps-settings-row-info">
          <div className="ps-settings-row-label">Jira</div>
          <div className="ps-settings-row-desc">
            {connected
              ? `Connected · ${projectKey} · ${hasApiToken ? 'API token saved' : 'No token'}`
              : 'Create issues from feedback via Jira Cloud REST API'}
          </div>
        </div>
        <div className="ps-settings-row-actions">
          {connected && (
            <>
              <button type="button" className="ps-btn ps-btn-secondary ps-btn-sm" disabled={Boolean(busy)} onClick={onTest}>
                {busy === 'test-jira' ? 'Sending…' : 'Send test'}
              </button>
              <button type="button" className="ps-btn ps-btn-ghost ps-btn-sm ps-btn-text-danger" disabled={Boolean(busy)} onClick={onDisconnect}>
                Disconnect
              </button>
            </>
          )}
        </div>
      </div>
      <input
        className="ps-input"
        style={{ width: '100%' }}
        type="url"
        placeholder="https://your-domain.atlassian.net"
        value={baseUrl}
        onChange={event => onBaseUrl(event.target.value)}
        autoComplete="off"
      />
      <div style={{ display: 'grid', width: '100%', gap: 8, gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
        <input
          className="ps-input"
          type="email"
          placeholder="Email"
          value={email}
          onChange={event => onEmail(event.target.value)}
          autoComplete="off"
        />
        <input
          className="ps-input"
          type="text"
          placeholder="Project key"
          value={projectKey}
          onChange={event => onProjectKey(event.target.value.toUpperCase())}
          spellCheck={false}
        />
      </div>
      <input
        className="ps-input"
        style={{ width: '100%' }}
        type="password"
        placeholder={hasApiToken ? 'API token saved — paste to replace' : 'API token'}
        value={apiToken}
        onChange={event => onApiToken(event.target.value)}
        autoComplete="off"
      />
      <button type="button" className="ps-btn ps-btn-primary ps-btn-sm" disabled={Boolean(busy) || !canSave} onClick={onSave}>
        {busy === 'jira' ? 'Saving…' : connected ? 'Update Jira' : 'Save'}
      </button>
    </div>
  )
}

function CaptureInstallRow({ onCopyExtensions, copied }: { onCopyExtensions: () => void; copied: boolean }) {
  const [storeUrl, setStoreUrl] = useState('')
  useEffect(() => {
    void captureInstall().then(info => setStoreUrl(info.storeUrl)).catch(() => setStoreUrl(''))
  }, [])
  return (
    <div className="ps-settings-row" style={{ alignItems: 'flex-start' }}>
      <div className="ps-settings-row-info">
        <div className="ps-settings-row-label">Install</div>
        <div className="ps-settings-row-desc">
          {storeUrl
            ? 'Add Capture from the Chrome Web Store, then sign in or paste an invite.'
            : <>Until the store listing is live: Chrome → <code style={{ color: 'var(--accent)' }}>chrome://extensions</code> → Developer mode → Load unpacked from the Capture folder.</>}
        </div>
      </div>
      <div className="ps-settings-row-actions">
        {storeUrl ? (
          <button
            type="button"
            className="ps-btn ps-btn-primary ps-btn-sm"
            onClick={() => window.open(storeUrl, '_blank', 'noopener')}
          >
            Add Capture
          </button>
        ) : (
          <button type="button" className="ps-btn ps-btn-primary ps-btn-sm" onClick={onCopyExtensions}>
            {copied ? 'Copied' : 'Copy chrome://extensions'}
          </button>
        )}
        <button
          type="button"
          className="ps-btn ps-btn-secondary ps-btn-sm"
          onClick={async () => {
            const reveal = window.kexoz?.revealCaptureExtension
            if (!reveal) {
              toast.error('Open the extension folder from the PortShare repo.')
              return
            }
            const result = await reveal()
            if (!result.ok) toast.error(result.error || 'Could not open the Capture folder')
          }}
        >
          Open Capture folder
        </button>
      </div>
    </div>
  )
}

function GitHubServerRow({
  connected, hasApiToken, repo, apiToken, onRepo, onApiToken, busy, onSave, onTest, onDisconnect,
}: {
  connected: boolean
  hasApiToken: boolean
  repo: string
  apiToken: string
  onRepo: (value: string) => void
  onApiToken: (value: string) => void
  busy: string
  onSave: () => void
  onTest: () => void
  onDisconnect: () => void
}) {
  const canSave = repo.trim() && (connected ? true : apiToken.trim())
  return (
    <div className="ps-settings-row" style={{ alignItems: 'flex-start', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', width: '100%', justifyContent: 'space-between', gap: 12 }}>
        <div className="ps-settings-row-info">
          <div className="ps-settings-row-label">GitHub (web)</div>
          <div className="ps-settings-row-desc">
            {connected
              ? `Connected · ${repo} · ${hasApiToken ? 'token saved' : 'No token'}`
              : 'Create GitHub issues from the public /f thread'}
          </div>
        </div>
        <div className="ps-settings-row-actions">
          {connected && (
            <>
              <button type="button" className="ps-btn ps-btn-secondary ps-btn-sm" disabled={Boolean(busy)} onClick={onTest}>
                {busy === 'test-github' ? 'Checking…' : 'Test'}
              </button>
              <button type="button" className="ps-btn ps-btn-ghost ps-btn-sm ps-btn-text-danger" disabled={Boolean(busy)} onClick={onDisconnect}>
                Disconnect
              </button>
            </>
          )}
        </div>
      </div>
      <input
        className="ps-input"
        style={{ width: '100%' }}
        placeholder="owner/repo"
        value={repo}
        onChange={event => onRepo(event.target.value.trim())}
        spellCheck={false}
        autoComplete="off"
      />
      <input
        className="ps-input"
        style={{ width: '100%' }}
        type="password"
        placeholder={hasApiToken ? 'Token saved — paste to replace' : 'GitHub PAT with repo issues'}
        value={apiToken}
        onChange={event => onApiToken(event.target.value)}
        autoComplete="off"
      />
      <button type="button" className="ps-btn ps-btn-primary ps-btn-sm" disabled={Boolean(busy) || !canSave} onClick={onSave}>
        {busy === 'github' ? 'Saving…' : connected ? 'Update GitHub' : 'Save'}
      </button>
    </div>
  )
}

function LinearServerRow({
  connected, hasApiToken, teamId, apiToken, onTeamId, onApiToken, busy, onSave, onTest, onDisconnect,
}: {
  connected: boolean
  hasApiToken: boolean
  teamId: string
  apiToken: string
  onTeamId: (value: string) => void
  onApiToken: (value: string) => void
  busy: string
  onSave: () => void
  onTest: () => void
  onDisconnect: () => void
}) {
  const canSave = teamId.trim() && (connected ? true : apiToken.trim())

  return (
    <div className="ps-settings-row" style={{ alignItems: 'flex-start', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', width: '100%', justifyContent: 'space-between', gap: 12 }}>
        <div className="ps-settings-row-info">
          <div className="ps-settings-row-label">Linear (auto)</div>
          <div className="ps-settings-row-desc">
            {connected
              ? `Connected · team ${teamId.slice(0, 8)}… · ${hasApiToken ? 'API key saved' : 'No key'}`
              : 'Auto-create Linear issues when Capture sends feedback'}
          </div>
        </div>
        <div className="ps-settings-row-actions">
          {connected && (
            <>
              <button type="button" className="ps-btn ps-btn-secondary ps-btn-sm" disabled={Boolean(busy)} onClick={onTest}>
                {busy === 'test-linear' ? 'Checking…' : 'Test'}
              </button>
              <button type="button" className="ps-btn ps-btn-ghost ps-btn-sm ps-btn-text-danger" disabled={Boolean(busy)} onClick={onDisconnect}>
                Disconnect
              </button>
            </>
          )}
        </div>
      </div>
      <input
        className="ps-input"
        style={{ width: '100%' }}
        placeholder="Team id (from Linear → Team settings)"
        value={teamId}
        onChange={event => onTeamId(event.target.value.trim())}
        spellCheck={false}
        autoComplete="off"
      />
      <input
        className="ps-input"
        style={{ width: '100%' }}
        type="password"
        placeholder={hasApiToken ? 'API key saved — paste to replace' : 'Linear API key'}
        value={apiToken}
        onChange={event => onApiToken(event.target.value)}
        autoComplete="off"
      />
      <button type="button" className="ps-btn ps-btn-primary ps-btn-sm" disabled={Boolean(busy) || !canSave} onClick={onSave}>
        {busy === 'linear' ? 'Saving…' : connected ? 'Update Linear' : 'Save'}
      </button>
    </div>
  )
}

function ToggleRow({
  label, description, checked, onChange,
}: { label: string; description: string; checked: boolean; onChange: (next: boolean) => void }) {
  return (
    <div className="ps-settings-row ps-ns-toggle-row">
      <div className="ps-settings-row-info">
        <div className="ps-settings-row-label">{label}</div>
        <div className="ps-settings-row-desc">{description}</div>
      </div>
      <label className="ps-toggle">
        <input type="checkbox" aria-label={label} checked={checked} onChange={event => onChange(event.target.checked)} />
        <span className="ps-toggle-track" />
      </label>
    </div>
  )
}
