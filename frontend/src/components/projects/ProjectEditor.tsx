import { useState } from 'react'
import type { PersistentTunnel, Project } from '../../lib/api'
import { TYPE_LABELS, projectNameError, shareLabel } from '../../lib/shares'
import { projectOf } from '../../hooks/useProjects'

const MAX_SHARES = 20

export default function ProjectEditor({ tunnels, projects, initial, onCancel, onSave, onDelete }: {
  tunnels: PersistentTunnel[]
  projects: Project[]
  initial?: Project
  onCancel: () => void
  onSave: (name: string, tunnelIds: string[]) => Promise<boolean>
  onDelete?: () => void
}) {
  const [name, setName] = useState(initial?.name ?? '')
  const [selected, setSelected] = useState<Set<string>>(new Set(initial?.tunnelIds ?? []))
  const [attempted, setAttempted] = useState(false)
  const [saving, setSaving] = useState(false)

  const nameError = projectNameError(name)
  const sharesError = selected.size > MAX_SHARES ? `A project can hold up to ${MAX_SHARES} shares.` : ''

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
      if (await onSave(name.trim().replace(/\s+/g, ' '), tunnels.filter(tunnel => selected.has(tunnel.id)).map(tunnel => tunnel.id))) onCancel()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="ps-card ps-project-editor">
      <div className="ps-ns-field">
        <label className="ps-label" htmlFor="project-name">Project name</label>
        <input
          id="project-name"
          className="ps-input"
          value={name}
          onChange={event => setName(event.target.value)}
          placeholder="my-app"
          autoFocus
          onKeyDown={event => {
            if (event.key === 'Enter') void save()
            if (event.key === 'Escape') onCancel()
          }}
        />
        {attempted && nameError && <p className="ps-ns-error">{nameError}</p>}
      </div>
      {tunnels.length > 0 && (
        <div className="ps-ns-field">
          <span className="ps-label">Shares in this project</span>
          <div className="ps-project-picks">
            {tunnels.map(tunnel => {
              const current = projectOf(projects, tunnel.id)
              const elsewhere = current && current.id !== initial?.id ? current : undefined
              return (
                <label key={tunnel.id} className="ps-check">
                  <input type="checkbox" checked={selected.has(tunnel.id)} onChange={() => toggle(tunnel.id)} />
                  <span>
                    {shareLabel(tunnel)}
                    <span className="ps-project-pick-meta">
                      {' · '}{TYPE_LABELS[tunnel.tunnelType ?? 'http']}
                      {tunnel.tunnelType !== 'folder' ? ` · localhost:${tunnel.port}` : ''}
                      {elsewhere ? ` · in ${elsewhere.name}` : ''}
                    </span>
                  </span>
                </label>
              )
            })}
          </div>
          {attempted && sharesError
            ? <p className="ps-ns-error">{sharesError}</p>
            : <p className="field-help">A share belongs to one project. Picking one from another project moves it here.</p>}
        </div>
      )}
      <div className="ps-project-editor-actions">
        {onDelete && (
          <button type="button" className="ps-btn ps-btn-ghost ps-btn-sm ps-btn-text-danger" onClick={onDelete} style={{ marginRight: 'auto' }}>
            Delete project
          </button>
        )}
        <button type="button" className="ps-btn ps-btn-ghost ps-btn-sm" onClick={onCancel}>Cancel</button>
        <button type="button" className="ps-btn ps-btn-primary ps-btn-sm" onClick={() => void save()} disabled={saving}>
          {saving ? 'Saving…' : initial ? 'Save' : 'Create project'}
        </button>
      </div>
    </div>
  )
}
