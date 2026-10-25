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
  /** 0 means no limit. */
  maxDownloads?: number
}

type ListeningPort = { port: number; label: string; source: 'docker' | 'process' }

type TimedCheck = { ok: boolean; ms: number; detail: string }

type DiagnosisResult = {
  online: boolean
  dns: TimedCheck
  api: TimedCheck
  ports: { port: number; open: boolean }[]
  proxy: string
}

declare global {
  interface Window {
    kexoz?: {
      platform?: string
      setTitleBarTheme?: (theme: 'light' | 'dark') => Promise<boolean>
      localRequest: (payload: LocalRequestPayload) => Promise<LocalRequestResult>
      checkPort: (port: number) => Promise<boolean>
      notify: (payload: { title: string; body: string }) => Promise<boolean>
      startTunnel?: (config: { key: string; tunnelUrl: string; tunnelType?: string; port: number }) => Promise<boolean>
      stopTunnel?: (key: string) => Promise<boolean>
      setTunnelPort?: (key: string, port: number) => Promise<boolean>
      updateTray?: (tunnels: import('./lib/api').PersistentTunnel[]) => Promise<boolean>
      setAutoStart?: (enabled: boolean) => Promise<boolean>
      pickFolder?: () => Promise<FolderInfo | null>
      inspectFolder?: (folder: string) => Promise<FolderInfo>
      startFolderServer?: (config: FolderServerConfig) => Promise<{ port: number }>
      stopFolderServer?: (shareId: string) => Promise<boolean>
      listListeningPorts?: () => Promise<ListeningPort[]>
      diagnose?: (config: { apiBase: string; ports: number[] }) => Promise<DiagnosisResult>
      folderDownloads?: () => Promise<Record<string, number>>
      onFolderDownload?: (callback: (shareId: string, count: number) => void) => () => void
      onTunnelState?: (callback: (key: string, state: import('./lib/api').ConnectionState, reason?: string) => void) => () => void
      onLogEntry: (callback: (key: string, entry: import('./lib/api').RequestLogEntry) => void) => () => void
    }
  }
}
