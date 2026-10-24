export {};

type LocalRequestPayload = {
  port: number
  method: string
  path: string
  headers: Record<string, string>
  /** Raw request body (v2 binary IPC). */
  body?: Uint8Array
  /** Legacy fallback; only used if main still expects base64. */
  bodyBase64?: string
}

type LocalRequestResult = {
  status: number
  headers: Record<string, string[]>
  /** Raw response body (Uint8Array over Electron IPC). */
  body: Uint8Array | ArrayBuffer
}

type FolderInfo = import('./lib/shares').FolderInfo

type FolderServerConfig = {
  shareId: string
  root: string
  readOnly: boolean
  excludes: string[]
  /** Public hostnames the share answers to; anything else is refused. */
  hosts: string[]
}

declare global {
  interface Window {
    kexoz?: {
      localRequest: (payload: LocalRequestPayload) => Promise<LocalRequestResult>
      checkPort: (port: number) => Promise<boolean>
      notify: (payload: { title: string; body: string }) => Promise<boolean>
      startTunnel?: (config: { tunnelUrl: string; tunnelType?: string; port: number }) => Promise<boolean>
      stopTunnel?: () => Promise<boolean>
      updateTray?: (tunnels: import('./lib/api').PersistentTunnel[]) => Promise<boolean>
      setAutoStart?: (enabled: boolean) => Promise<boolean>
      pickFolder?: () => Promise<FolderInfo | null>
      inspectFolder?: (folder: string) => Promise<FolderInfo>
      startFolderServer?: (config: FolderServerConfig) => Promise<{ port: number }>
      stopFolderServer?: (shareId: string) => Promise<boolean>
      onTunnelState?: (callback: (state: import('./lib/api').ConnectionState, msg?: string) => void) => void
      onLogEntry: (callback: (entry: import('./lib/api').RequestLogEntry) => void) => void
    }
  }
}
