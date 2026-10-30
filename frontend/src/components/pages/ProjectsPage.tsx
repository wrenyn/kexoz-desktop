import { useState } from 'react'
import type { PersistentTunnel, Project } from '../../lib/api'
import { environmentError, environmentLabel, environmentName, shareAddress, shareLabel, shareStatus } from '../../lib/shares'
import ProjectEditor from '../projects/ProjectEditor'
import ShareList, { type ShareControls } from '../shares/ShareList'
import { useCopy } from '../../hooks/useCopy'

type Props = ShareControls & {
  projects: Project[]
  projectsLoaded: boolean
  openId: string | null
  onOpenProject: (id: string | null) => void
  /** Opens the new share window for a project; routed starts with path routing on. */
  onNewShare: (projectId?: string, routed?: boolean, environment?: string) => void
  onMoveShare: (tunnel: PersistentTunnel, projectId: string) => void
  /** Resolves to the new project's id, or null when it failed. */
  onCreateProject: (name: string, tunnelIds: string[]) => Promise<string | null>
  onSaveProject: (project: Project, name: string, tunnelIds: string[]) => Promise<boolean>
  onDeleteProject: (project: Project) => Promise<boolean>
  onStartProject: (project: Project) => void
  onStopProject: (project: Project) => void
  /** Copies environment `from` into a new one; resolves to whether it worked. */
  onCreateEnvironment: (project: Project, name: string, from: string) => Promise<boolean>
  onOpenInbox: (project: Project) => void
}

const quoted = (name: string) => /\s/.test(name) ? `"${name}"` : name
const startCommand = (name: string, environment = '') => `kexoz start ${quoted(name)}${environment ? ` --env ${environment}` : ''}`

/** kexoz.json for the project's code folder, so `kexoz start` there needs no arguments. */
const projectFile = (name: string, environment: string) =>
  `${JSON.stringify(environment ? { project: name, environment } : { project: name }, null, 2)}\n`

function NewEnvironmentForm({ environments, onCancel, onCreate }: {
  environments: string[]
  onCancel: () => void
  onCreate: (name: string, from: string) => Promise<boolean>
}) {
  const [name, setName] = useState('')
  const [from, setFrom] = useState('')
  const [busy, setBusy] = useState(false)
  const error = environmentError(name)
  const taken = name.trim() !== '' && environments.includes(environmentName(name))
  const ready = name.trim() !== '' && !error && !taken

  return (
    <form
      className="ps-card ps-env-form"
      onSubmit={async event => {
        event.preventDefault()
        if (!ready) return
        setBusy(true)
        const ok = await onCreate(environmentName(name), from)
        setBusy(false)
        if (ok) onCancel()
      }}
    >
      <div className="ps-env-form-text">
        <span className="ps-group-name">New environment</span>
        <span className="ps-group-meta">Copies every share with its ports, routes and access, on new addresses. Start it separately from main.</span>
      </div>
      <div className="ps-env-form-fields">
        <input className="ps-input" autoFocus placeholder="staging, pr-12…" maxLength={24} value={name} onChange={event => setName(event.target.value)} aria-label="Environment name" aria-invalid={Boolean(error) || taken} />
        <select className="ps-select" value={from} onChange={event => setFrom(event.target.value)} aria-label="Copy from">
          {environments.map(item => <option key={item || 'main'} value={item}>Copy of {environmentLabel(item)}</option>)}
        </select>
        <button type="submit" className="ps-btn ps-btn-primary ps-btn-sm" disabled={busy || !ready}>Create</button>
        <button type="button" className="ps-btn ps-btn-ghost ps-btn-sm" onClick={onCancel}>Cancel</button>
      </div>
      {(error || taken) && <span className="ps-panel-hint ps-share-access-error">{error || 'This project already has that environment.'}</span>}
    </form>
  )
}

function summarize(project: Project, byId: Map<string, PersistentTunnel>) {
  const shares = project.tunnelIds.map(id => byId.get(id)).filter((tunnel): tunnel is PersistentTunnel => Boolean(tunnel))
  const live = shares.filter(tunnel => shareStatus(tunnel) === 'active')
  // Only one share serves an address, so a share whose address is already live can't start.
  const liveAddresses = new Set(live.map(tunnel => tunnel.subdomain).filter(Boolean))
  const startable = shares.some(tunnel =>
    (!tunnel.active || tunnel.paused) && shareStatus(tunnel) !== 'expired' && !(tunnel.subdomain && liveAddresses.has(tunnel.subdomain)))
  const count = `${shares.length} ${shares.length === 1 ? 'share' : 'shares'}`
  const meta = shares.length === 0 ? 'No shares yet' : live.length === 0 ? count : `${live.length} of ${shares.length} running`
  return { shares, running: live.length, startable, meta }
}

function ProjectStatus({ running, total }: { running: number; total: number }) {
  if (total === 0) return <span className="ps-project-status">Not set up</span>
  if (running === 0) return <span className="ps-project-status">Stopped</span>
  return (
    <span className="ps-project-status running">
      <span className="ps-share-dot active" aria-hidden="true" />
      {running === total ? 'Running' : `${running} of ${total} running`}
    </span>
  )
}

const PREVIEW_SHARES = 4

/** The project limited to one environment's shares, so start and stop leave the others alone. */
function inEnvironment(project: Project, byId: Map<string, PersistentTunnel>, environment: string): Project {
  const ids = project.tunnelIds.filter(id => (byId.get(id)?.environment ?? '') === environment)
  if (ids.length === project.tunnelIds.length) return project
  return { ...project, name: environment ? `${project.name} (${environment})` : project.name, tunnelIds: ids }
}

/** The two ways to put an app online: a link per service, or one link split by path. */
function SetupChoices({ onSeparate, onRouted }: { onSeparate: () => void; onRouted: () => void }) {
  return (
    <div className="ps-ns-kinds ps-setup-choices">
      <button type="button" className="ps-ns-kind" onClick={onRouted}>
        <span className="ps-ns-kind-title">One link for the whole app</span>
        <span className="ps-ns-kind-desc">Your frontend gets / and paths like /api go to your backend’s port. No CORS setup, one URL to send around.</span>
      </button>
      <button type="button" className="ps-ns-kind" onClick={onSeparate}>
        <span className="ps-ns-kind-title">A link per service</span>
        <span className="ps-ns-kind-desc">Share your frontend, backend or anything else on its own address. Add each one to this project.</span>
      </button>
    </div>
  )
}

export default function ProjectsPage(props: Props) {
  const {
    persistentTunnels, isBusy, projects, projectsLoaded, openId, onOpenProject, onNewShare, onMoveShare,
    onCreateProject, onSaveProject, onDeleteProject, onStartProject, onStopProject, onCreateEnvironment, onOpenInbox,
  } = props
  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState(false)
  const [envTab, setEnvTab] = useState('')
  const [addingEnv, setAddingEnv] = useState(false)
  const { copied, copy } = useCopy()
  const byId = new Map(persistentTunnels.map(tunnel => [tunnel.id, tunnel]))
  const project = openId ? projects.find(item => item.id === openId) : undefined
  const grouped = new Set(projects.flatMap(item => item.tunnelIds))
  const loose = persistentTunnels.filter(tunnel => !grouped.has(tunnel.id))

  const openProject = (id: string | null) => {
    onOpenProject(id)
    setEditing(false)
    setCreating(false)
    setEnvTab('')
    setAddingEnv(false)
  }

  const runButtons = (item: Project, running: number, startable: boolean) => (
    <>
      {running > 0 && (
        <button type="button" className="ps-btn ps-btn-secondary ps-btn-sm" onClick={() => onStopProject(item)} disabled={isBusy}>Stop all</button>
      )}
      {startable && (
        <button type="button" className="ps-btn ps-btn-primary ps-btn-sm" onClick={() => onStartProject(item)} disabled={isBusy}>
          {running > 0 ? 'Start the rest' : 'Start all'}
        </button>
      )}
    </>
  )

  if (project) {
    const all = summarize(project, byId).shares
    const environments = [...new Set(['', ...all.map(tunnel => tunnel.environment ?? '')])].sort()
    const env = environments.includes(envTab) ? envTab : ''
    const scoped = inEnvironment(project, byId, env)
    const { shares, running, startable } = summarize(scoped, byId)
    const command = startCommand(project.name, env)
    return (
      <div className="ps-main">
        <div className="ps-page-header animate-fade-down">
          <div className="ps-page-heading">
            <button type="button" className="ps-page-crumb" onClick={() => openProject(null)}>Projects</button>
            <div className="ps-project-title-row">
              <h1 className="ps-page-title">{project.name}</h1>
              <ProjectStatus running={running} total={shares.length} />
            </div>
            <p className="ps-page-subtitle">
              {shares.length === 0 ? 'No shares yet' : `${shares.length} ${shares.length === 1 ? 'share' : 'shares'}`}
              {env ? ` in ${env}` : ''}
            </p>
          </div>
          <div className="ps-header-actions">
            <button type="button" className="ps-btn ps-btn-ghost ps-btn-sm" onClick={() => onOpenInbox(project)}>Inbox</button>
            <button type="button" className="ps-btn ps-btn-ghost ps-btn-sm" onClick={() => setEditing(true)} disabled={editing}>Edit</button>
            <button type="button" className="ps-btn ps-btn-secondary ps-btn-sm" onClick={() => onNewShare(project.id, false, env)}>Add share</button>
            {runButtons(scoped, running, startable)}
          </div>
        </div>

        <div className="ps-page-content ps-groups animate-fade-up">
          {shares.length > 0 && (
            <div className="ps-project-cli">
              <span className="ps-project-cli-label">From a terminal</span>
              <code className="ps-project-cli-command">{command}</code>
              <button type="button" className="ps-btn ps-btn-ghost ps-btn-sm" onClick={() => void copy('command', command)}>
                {copied === 'command' ? 'Copied' : 'Copy'}
              </button>
              <button
                type="button"
                className="ps-btn ps-btn-ghost ps-btn-sm"
                onClick={() => void copy('file', projectFile(project.name, env))}
                title="Save this as kexoz.json in your code folder, then run kexoz start there"
              >
                {copied === 'file' ? 'Copied' : 'Copy kexoz.json'}
              </button>
            </div>
          )}
          {all.length > 0 && (
            <div className="ps-env-bar">
              {environments.length > 1 && (
                <div className="ps-segmented" role="tablist" aria-label="Environment">
                  {environments.map(item => {
                    const live = all.some(tunnel => (tunnel.environment ?? '') === item && shareStatus(tunnel) === 'active')
                    return (
                      <button
                        key={item || 'main'}
                        type="button"
                        role="tab"
                        aria-selected={env === item}
                        className={`ps-segmented-item ${env === item ? 'active' : ''}`}
                        onClick={() => setEnvTab(item)}
                      >
                        {live && <span className="ps-share-dot active" aria-hidden="true" />}
                        {environmentLabel(item)}
                      </button>
                    )
                  })}
                </div>
              )}
              {!addingEnv && (
                <button type="button" className="ps-panel-disclosure" onClick={() => setAddingEnv(true)}>
                  {environments.length > 1 ? 'New environment' : 'Copy this project to a staging or branch environment'}
                </button>
              )}
            </div>
          )}
          {addingEnv && (
            <NewEnvironmentForm
              environments={environments}
              onCancel={() => setAddingEnv(false)}
              onCreate={async (name, from) => {
                const ok = await onCreateEnvironment(project, name, from)
                if (ok) setEnvTab(name)
                return ok
              }}
            />
          )}
          {editing && (
            <ProjectEditor
              key={project.id}
              tunnels={persistentTunnels}
              projects={projects}
              initial={project}
              onCancel={() => setEditing(false)}
              onSave={(name, ids) => onSaveProject(project, name, ids)}
              onDelete={() => void onDeleteProject(project).then(deleted => { if (deleted) openProject(null) })}
            />
          )}
          {shares.length > 0 ? (
            <ShareList {...props} tunnels={shares} projects={projects} onMoveShare={onMoveShare} />
          ) : !editing && (
            <div className="ps-card">
              <div className="ps-empty ps-empty-setup">
                <span className="ps-empty-title">Put {project.name} online</span>
                <span className="ps-empty-sub">Pick how visitors reach your app. You can mix both and change it later.</span>
                <SetupChoices onRouted={() => onNewShare(project.id, true)} onSeparate={() => onNewShare(project.id)} />
                {loose.length > 0 && (
                  <button type="button" className="ps-btn ps-btn-ghost ps-btn-sm" onClick={() => setEditing(true)}>Add shares you already have</button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    )
  }

  const liveCount = persistentTunnels.filter(tunnel => shareStatus(tunnel) === 'active').length
  const overview = projects.length === 0
    ? 'Each project is one app: its frontend, backend and anything else you share, started with one click.'
    : [
        `${projects.length} ${projects.length === 1 ? 'project' : 'projects'}`,
        `${persistentTunnels.length} ${persistentTunnels.length === 1 ? 'share' : 'shares'}`,
        liveCount > 0 ? `${liveCount} running` : 'nothing running',
      ].join(' · ')

  return (
    <div className="ps-main">
      <div className="ps-page-header animate-fade-down">
        <div>
          <h1 className="ps-page-title">Projects</h1>
          <p className="ps-page-subtitle">{overview}</p>
        </div>
      </div>

      <div className="ps-page-content ps-groups animate-fade-up">
        {creating && (
          <ProjectEditor
            tunnels={loose}
            projects={projects}
            onCancel={() => setCreating(false)}
            onSave={async (name, ids) => {
              const id = await onCreateProject(name, ids)
              if (id) openProject(id)
              return Boolean(id)
            }}
          />
        )}

        {projects.length > 0 ? (
          <div className="ps-project-grid">
            {projects.map(item => {
              const { shares, running } = summarize(item, byId)
              const main = inEnvironment(item, byId, '')
              const mainSummary = summarize(main, byId)
              const otherEnvironments = new Set(shares.map(tunnel => tunnel.environment ?? '').filter(Boolean)).size
              const hidden = mainSummary.shares.length - PREVIEW_SHARES
              const meta = [
                shares.length === 0 ? '' : `${shares.length} ${shares.length === 1 ? 'share' : 'shares'}`,
                otherEnvironments > 0 ? `${otherEnvironments + 1} environments` : '',
              ].filter(Boolean).join(' · ')
              return (
                <article key={item.id} className={`ps-project-card ${running > 0 ? 'running' : ''}`}>
                  <button type="button" className="ps-project-card-open" onClick={() => openProject(item.id)} aria-label={`Open ${item.name}`} />
                  <div className="ps-project-card-head">
                    <h2 className="ps-project-card-name">{item.name}</h2>
                    <ProjectStatus running={running} total={shares.length} />
                  </div>
                  {mainSummary.shares.length > 0 ? (
                    <ul className="ps-project-card-shares">
                      {mainSummary.shares.slice(0, PREVIEW_SHARES).map(tunnel => (
                        <li key={tunnel.id}>
                          <span className={`ps-share-dot ${shareStatus(tunnel)}`} aria-hidden="true" />
                          <span className="ps-project-card-share-name">{shareLabel(tunnel)}</span>
                          {tunnel.name?.trim() && <span className="ps-project-card-share-address">{shareAddress(tunnel)}</span>}
                        </li>
                      ))}
                      {hidden > 0 && <li className="ps-project-card-more">{hidden} more</li>}
                    </ul>
                  ) : (
                    <p className="ps-project-card-empty">Add your frontend, backend or anything else to start them together.</p>
                  )}
                  <div className="ps-project-card-foot">
                    <span className="ps-project-card-meta">{meta}</span>
                    <div className="ps-project-card-actions">
                      {shares.length === 0
                        ? <button type="button" className="ps-btn ps-btn-secondary ps-btn-sm" onClick={() => openProject(item.id)}>Set up</button>
                        : runButtons(main, mainSummary.running, mainSummary.startable)}
                    </div>
                  </div>
                </article>
              )
            })}
            {!creating && (
              <button type="button" className="ps-project-card ps-project-card-new" onClick={() => setCreating(true)}>
                <span className="ps-project-card-new-title">New project</span>
                <span className="ps-project-card-new-sub">Group the frontend, backend and anything else one app needs.</span>
              </button>
            )}
          </div>
        ) : projectsLoaded && !creating && (
          <div className="ps-card">
            <div className="ps-empty ps-empty-setup">
              <span className="ps-empty-title">Start with a project</span>
              <span className="ps-empty-sub">
                A project is one app you’re working on. Inside it, share your frontend and backend on separate links,
                or on one link that sends /api to your backend.
              </span>
              <button type="button" className="ps-btn ps-btn-primary" onClick={() => setCreating(true)} style={{ marginTop: 8 }}>
                New project
              </button>
            </div>
          </div>
        )}

        {loose.length > 0 && (
          <section className="ps-project-section">
            <div className="ps-project-section-head">
              <h2 className="ps-project-section-title">Not in a project</h2>
              <p className="ps-project-section-hint">
                {projects.length > 0
                  ? 'Open a share to move it into a project, so it starts with the rest of the app.'
                  : 'Create a project to start these together with one click.'}
              </p>
            </div>
            <ShareList {...props} tunnels={loose} projects={projects} onMoveShare={onMoveShare} />
          </section>
        )}
      </div>
    </div>
  )
}
