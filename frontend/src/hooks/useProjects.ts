import { useCallback, useEffect, useState } from 'react'
import {
  createEnvironment, createProject, deleteProject, listProjects, setTunnelProject, updateProject, type PersistentTunnel, type Project,
} from '../lib/api'

/** Projects for the signed-in client. Actions throw so callers can show the error. */
export function useProjects(clientId: string | undefined) {
  const [projects, setProjects] = useState<Project[]>([])
  const [loaded, setLoaded] = useState(false)

  const refresh = useCallback(async () => {
    if (!clientId) return
    try {
      setProjects(await listProjects(clientId))
    } catch {
      // Keep what we have; the next change refreshes it.
    } finally {
      setLoaded(true)
    }
  }, [clientId])

  useEffect(() => { void refresh() }, [refresh])

  const create = useCallback(async (name: string, tunnelIds: string[] = []): Promise<string> => {
    if (!clientId) return ''
    const result = await createProject(clientId, name, tunnelIds)
    setProjects(result.projects)
    return result.projectId
  }, [clientId])

  const save = useCallback(async (project: Project, name: string, tunnelIds: string[]) => {
    if (!clientId) return
    setProjects(await updateProject(clientId, project.id, name, tunnelIds))
  }, [clientId])

  const remove = useCallback(async (project: Project) => {
    if (!clientId) return
    setProjects(await deleteProject(clientId, project.id))
  }, [clientId])

  const move = useCallback(async (tunnelId: string, projectId: string) => {
    if (!clientId) return
    setProjects(await setTunnelProject(clientId, tunnelId, projectId))
  }, [clientId])

  /** Copies an environment's shares into a new one and resolves to the copies. */
  const addEnvironment = useCallback(async (projectId: string, name: string, from: string): Promise<PersistentTunnel[]> => {
    if (!clientId) return []
    const result = await createEnvironment(clientId, projectId, name, from)
    if (result.projects.length > 0) setProjects(result.projects)
    return result.tunnels
  }, [clientId])

  return { projects, loaded, refresh, create, save, remove, move, addEnvironment }
}

export type ProjectsApi = ReturnType<typeof useProjects>

export const projectOf = (projects: Project[], tunnelId: string): Project | undefined =>
  projects.find(project => project.tunnelIds.includes(tunnelId))
