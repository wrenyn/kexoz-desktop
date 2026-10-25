import { useCallback, useEffect, useState } from 'react'
import { toast } from 'react-hot-toast'
import { createProject, deleteProject, listProjects, updateProject, type PersistentTunnel, type Project } from '../../lib/api'
import { STATUS_BADGES, TYPE_LABELS, shareStatus, shareUrl } from '../../lib/shares'
import { extractError } from '../../lib/utils'

type Props = {
  clientId: string
  tunnels: PersistentTunnel[]
  tunnelNames: Record<string, string>
  isBusy: boolean
  onStartTunnel: (tunnel: PersistentTunnel) => Promise<void>
  onStopTunnel: (tunnel: PersistentTunnel) => Promise<void>
}

const NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9 _-]{0,39}$/

function ProjectEditor({ tunnels, tunnelNames, initial, onCancel, onSave }: {
  tunnels: PersistentTunnel[]
  tunnelNames: Record<string, string>
  initial?: Project
  onCancel: () => void
  onSave: (name: string, tunnelIds: string[]) => Promise<boolean>
}) {
  const [name, setName] = useState(initial?.name ?? '')
  const [selected, setSelected] = useState<Set<string>>(new Set(initial?.tunnelIds ?? []))
  const [attempted, setAttempted] = useState(false)
  const [saving, setSaving] = useState(false)

  const nameError = !name.trim() ? 'Give the project a name.' : !NAME_PATTERN.test(name.trim()) ? 'Use letters, numbers, spaces, dashes or underscores (up to 40).' : ''
  const sharesError = selected.size === 0 ? 'Pick at least one share.' : selected.size > 20 ? 'A project can hold up to 20 shares.' : ''

  const toggle = (id: string) => setSelected(current => {
    const next = new Set(current)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    return next
  })

  const save = async () => {
    setAttempted(true)
    if (nameError || sharesError || saving) return
    setSaving(true)
    try {
      if (await onSave(name.trim(), [...selected])) onCancel()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="ps-card ps-project-editor">
      <div className="ps-ns-field">
        <label className="ps-label" htmlFor="project-name">Name</label>
        <input
          id="project-name"
          className="ps-input"
          value={name}
          onChange={event => setName(event.target.value)}
          placeholder="my-app"
          autoFocus
          onKeyDown={event => { if (event.key === 'Enter') void save() }}
        />
        {attempted && nameError && <p className="ps-ns-error">{nameError}</p>}
      </div>
      <div className="ps-ns-field">
        <span className="ps-label">Shares</span>
        {tunnels.length === 0 ? (
          <p className="field-help">Create a share first, then group it here.</p>
        ) : (
          <div className="ps-project-picks">
            {tunnels.map(tunnel => (
              <label key={tunnel.id} className="ps-check">
                <input type="checkbox" checked={selected.has(tunnel.id)} onChange={() => toggle(tunnel.id)} />
                <span>
                  {tunnelNames[tunnel.id] || shareUrl(tunnel).replace(/^https:\/\//, '')}
                  <span className="ps-project-pick-meta"> · {TYPE_LABELS[tunnel.tunnelType ?? 'http']}{tunnel.tunnelType !== 'folder' ? ` · localhost:${tunnel.port}` : ''}</span>
                </span>
              </label>
            ))}
          </div>
        )}
        {attempted && sharesError && <p className="ps-ns-error">{sharesError}</p>}
      </div>
      <div className="ps-project-editor-actions">
        <button className="ps-btn ps-btn-ghost ps-btn-sm" onClick={onCancel}>Cancel</button>
        <button className="ps-btn ps-btn-primary ps-btn-sm" onClick={() => void save()} disabled={saving}>{saving ? 'Saving…' : 'Save project'}</button>
      </div>
    </div>
  )
}

export default function ProjectsPage({ clientId, tunnels, tunnelNames, isBusy, onStartTunnel, onStopTunnel }: Props) {
  const [projects, setProjects] = useState<Project[]>([])
  const [loaded, setLoaded] = useState(false)
  const [editing, setEditing] = useState<string | 'new' | null>(null)
  const [running, setRunning] = useState<string | null>(null)
  const [copied, setCopied] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      setProjects(await listProjects(clientId))
    } catch (err) {
      toast.error(extractError(err))
    } finally {
      setLoaded(true)
    }
  }, [clientId])

  useEffect(() => { void refresh() }, [refresh])

  const byId = new Map(tunnels.map(tunnel => [tunnel.id, tunnel]))

  const save = async (project: Project | undefined, name: string, tunnelIds: string[]) => {
    try {
      setProjects(project ? await updateProject(clientId, project.id, name, tunnelIds) : await createProject(clientId, name, tunnelIds))
      toast.success(project ? 'Project saved' : `Created ${name}`)
      return true
    } catch (err) {
      toast.error(extractError(err))
      return false
    }
  }

  const remove = async (project: Project) => {
    try {
      setProjects(await deleteProject(clientId, project.id))
    } catch (err) {
      toast.error(extractError(err))
    }
  }

  const startAll = async (project: Project) => {
    setRunning(project.id)
    try {
      for (const id of project.tunnelIds) {
        const tunnel = byId.get(id)
        if (tunnel && !tunnel.active && shareStatus(tunnel) !== 'expired') await onStartTunnel(tunnel)
      }
    } finally {
      setRunning(null)
    }
  }

  const stopAll = async (project: Project) => {
    setRunning(project.id)
    try {
      for (const id of project.tunnelIds) {
        const tunnel = byId.get(id)
        if (tunnel?.active) await onStopTunnel(tunnel)
      }
    } finally {
      setRunning(null)
    }
  }

  const copyCommand = async (project: Project) => {
    const command = `kexoz start ${/\s/.test(project.name) ? `"${project.name}"` : project.name}`
    await navigator.clipboard.writeText(command).catch(() => {})
    setCopied(project.id)
    window.setTimeout(() => setCopied(current => current === project.id ? null : current), 1500)
  }

  return (
    <div className="ps-main">
      <div className="ps-page-header animate-fade-down">
        <div>
          <h1 className="ps-page-title">Projects</h1>
          <p className="ps-page-subtitle">Start a group of shares together, here or with kexoz start</p>
        </div>
        <div className="ps-header-actions">
          <button className="ps-btn ps-btn-primary ps-btn-sm" onClick={() => setEditing('new')} disabled={editing !== null}>New project</button>
        </div>
      </div>

      <div className="ps-page-content ps-projects animate-fade-up">
        {editing === 'new' && (
          <ProjectEditor
            tunnels={tunnels}
            tunnelNames={tunnelNames}
            onCancel={() => setEditing(null)}
            onSave={(name, ids) => save(undefined, name, ids)}
          />
        )}

        {loaded && projects.length === 0 && editing !== 'new' && (
          <div className="ps-card">
            <div className="ps-empty">
              <span className="ps-empty-title">No projects yet</span>
              <span className="ps-empty-sub">Group the shares one app needs, like a frontend and its API, and start them with one click.</span>
              <button className="ps-btn ps-btn-primary" onClick={() => setEditing('new')} style={{ marginTop: 8 }}>New project</button>
            </div>
          </div>
        )}

        {projects.map(project => editing === project.id ? (
          <ProjectEditor
            key={project.id}
            tunnels={tunnels}
            tunnelNames={tunnelNames}
            initial={project}
            onCancel={() => setEditing(null)}
            onSave={(name, ids) => save(project, name, ids)}
          />
        ) : (
          <section key={project.id} className="ps-card ps-project">
            <header className="ps-project-head">
              <div>
                <div className="ps-project-name">{project.name}</div>
                <button className="ps-project-command" onClick={() => void copyCommand(project)} title="Copy the CLI command">
                  {copied === project.id ? 'Copied' : `kexoz start ${project.name}`}
                </button>
              </div>
              <div className="ps-project-actions">
                {project.tunnelIds.some(id => byId.get(id)?.active) && (
                  <button className="ps-btn ps-btn-secondary ps-btn-sm" disabled={isBusy || running !== null} onClick={() => void stopAll(project)}>Stop all</button>
                )}
                {project.tunnelIds.some(id => { const t = byId.get(id); return t && !t.active }) && (
                  <button className="ps-btn ps-btn-primary ps-btn-sm" disabled={isBusy || running !== null} onClick={() => void startAll(project)}>
                    {running === project.id ? 'Starting…' : 'Start all'}
                  </button>
                )}
                <button className="ps-btn ps-btn-ghost ps-btn-sm" onClick={() => setEditing(project.id)} disabled={editing !== null}>Edit</button>
                <button className="ps-btn ps-btn-ghost ps-btn-sm ps-btn-text-danger" onClick={() => void remove(project)}>Delete</button>
              </div>
            </header>
            <ul className="ps-project-shares">
              {project.tunnelIds.map(id => {
                const tunnel = byId.get(id)
                if (!tunnel) return null
                const badge = STATUS_BADGES[shareStatus(tunnel)]
                return (
                  <li key={id}>
                    <span className="ps-project-share-name">{tunnelNames[id] || shareUrl(tunnel).replace(/^https:\/\//, '')}</span>
                    <span className="ps-project-share-meta">{TYPE_LABELS[tunnel.tunnelType ?? 'http']}{tunnel.tunnelType !== 'folder' ? ` · localhost:${tunnel.port}` : ''}</span>
                    <span className={`ps-badge ${badge.className}`}>{badge.label}</span>
                  </li>
                )
              })}
            </ul>
          </section>
        ))}
      </div>
    </div>
  )
}
