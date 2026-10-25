import { useState } from 'react'
import type { PersistentTunnel, Project } from '../../lib/api'
import { shareLabel, shareStatus } from '../../lib/shares'
import ProjectEditor from '../projects/ProjectEditor'
import ShareList, { type ShareControls } from '../shares/ShareList'
import { useCopy } from '../../hooks/useCopy'

type Props = ShareControls & {
  projects: Project[]
  projectsLoaded: boolean
  /** Opens the new share window for a project. */
  onNewShare: (projectId: string) => void
  /** Resolves to the new project's id, or null when it failed. */
  onCreateProject: (name: string, tunnelIds: string[]) => Promise<string | null>
  onSaveProject: (project: Project, name: string, tunnelIds: string[]) => Promise<boolean>
  onDeleteProject: (project: Project) => Promise<boolean>
  onStartProject: (project: Project) => void
  onStopProject: (project: Project) => void
}

const startCommand = (name: string) => `kexoz start ${/\s/.test(name) ? `"${name}"` : name}`

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

export default function ProjectsPage(props: Props) {
  const {
    persistentTunnels, isBusy, projects, projectsLoaded, onNewShare,
    onCreateProject, onSaveProject, onDeleteProject, onStartProject, onStopProject,
  } = props
  const [openId, setOpenId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState(false)
  const { copied, copy } = useCopy()
  const byId = new Map(persistentTunnels.map(tunnel => [tunnel.id, tunnel]))
  const project = openId ? projects.find(item => item.id === openId) : undefined

  const openProject = (id: string | null) => {
    setOpenId(id)
    setEditing(false)
    setCreating(false)
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
    const { shares, running, startable, meta } = summarize(project, byId)
    const command = startCommand(project.name)
    return (
      <div className="ps-main">
        <div className="ps-page-header animate-fade-down">
          <div className="ps-page-heading">
            <button type="button" className="ps-page-crumb" onClick={() => openProject(null)}>Projects</button>
            <h1 className="ps-page-title">{project.name}</h1>
            <p className="ps-page-subtitle">
              {meta}
              {shares.length > 0 && (
                <>
                  {' · '}
                  <button type="button" className="ps-group-command" onClick={() => void copy('command', command)} title="Copy the command that starts this project">
                    {copied === 'command' ? 'Copied' : command}
                  </button>
                </>
              )}
            </p>
          </div>
          <div className="ps-header-actions">
            {runButtons(project, running, startable)}
            <button type="button" className="ps-btn ps-btn-ghost ps-btn-sm" onClick={() => setEditing(true)} disabled={editing}>Edit</button>
            <button type="button" className="ps-btn ps-btn-secondary ps-btn-sm" onClick={() => onNewShare(project.id)}>New share</button>
          </div>
        </div>

        <div className="ps-page-content ps-groups animate-fade-up">
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
            <div className="ps-card ps-group">
              <ShareList {...props} tunnels={shares} />
            </div>
          ) : !editing && (
            <div className="ps-card">
              <div className="ps-empty">
                <span className="ps-empty-title">No shares in {project.name} yet</span>
                <span className="ps-empty-sub">Shares you create here start together with one click.</span>
                <div className="ps-empty-actions">
                  <button type="button" className="ps-btn ps-btn-primary" onClick={() => onNewShare(project.id)}>New share</button>
                  {persistentTunnels.length > 0 && (
                    <button type="button" className="ps-btn ps-btn-ghost" onClick={() => setEditing(true)}>Add existing shares</button>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="ps-main">
      <div className="ps-page-header animate-fade-down">
        <div>
          <h1 className="ps-page-title">Projects</h1>
          <p className="ps-page-subtitle">Keep shares that belong together in one place and start them with one click</p>
        </div>
        {projects.length > 0 && (
          <div className="ps-header-actions">
            <button type="button" className="ps-btn ps-btn-secondary ps-btn-sm" onClick={() => setCreating(true)} disabled={creating}>New project</button>
          </div>
        )}
      </div>

      <div className="ps-page-content ps-groups animate-fade-up">
        {creating && (
          <ProjectEditor
            tunnels={persistentTunnels}
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
          <div className="ps-card ps-group">
            <ul className="ps-share-list">
              {projects.map(item => {
                const { shares, running, startable, meta } = summarize(item, byId)
                const names = shares.map(shareLabel).join(', ')
                return (
                  <li key={item.id} className="ps-share-row">
                    <button type="button" className="ps-share-row-main" onClick={() => openProject(item.id)} aria-label={`Open ${item.name}`}>
                      <span className={`ps-share-dot ${running > 0 ? 'active' : ''}`} aria-hidden="true" />
                      <span className="ps-share-row-text">
                        <span className="ps-share-row-name">
                          {item.name}
                          <span className={`ps-share-row-status ${running > 0 ? 'active' : ''}`}>{meta}</span>
                        </span>
                        {names && <span className="ps-share-row-sub">{names}</span>}
                      </span>
                    </button>
                    <div className="ps-share-row-actions">
                      {shares.length === 0
                        ? <button type="button" className="ps-btn ps-btn-ghost ps-btn-sm" onClick={() => onNewShare(item.id)}>New share</button>
                        : runButtons(item, running, startable)}
                    </div>
                  </li>
                )
              })}
            </ul>
          </div>
        ) : projectsLoaded && !creating && (
          <div className="ps-card">
            <div className="ps-empty">
              <span className="ps-empty-title">No projects yet</span>
              <span className="ps-empty-sub">Put a frontend and its API in one project, then start both with one click.</span>
              <button type="button" className="ps-btn ps-btn-primary" onClick={() => setCreating(true)} style={{ marginTop: 8 }}>
                New project
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
