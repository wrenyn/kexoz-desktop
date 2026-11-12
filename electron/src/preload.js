const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('kexoz', {
  platform: process.platform,
  setTitleBarTheme: (theme) => ipcRenderer.invoke('kexoz:set-titlebar-theme', theme),
  localRequest: (payload) => ipcRenderer.invoke('kexoz:local-request', payload),
  checkPort: (port) => ipcRenderer.invoke('kexoz:check-port', port),
  notify: (payload) => ipcRenderer.invoke('kexoz:notify', payload),
  onOpenNote: (callback) => {
    const handler = (_event, payload) => callback(payload);
    ipcRenderer.on('kexoz:open-note', handler);
    return () => ipcRenderer.removeListener('kexoz:open-note', handler);
  },
  startTunnel: (config) => ipcRenderer.invoke('kexoz:start-tunnel', config),
  stopTunnel: (key) => ipcRenderer.invoke('kexoz:stop-tunnel', key),
  setTunnelPort: (key, port) => ipcRenderer.invoke('kexoz:set-tunnel-port', key, port),
  updateTray: (tunnels) => ipcRenderer.invoke('kexoz:update-tray', tunnels),
  onTrayAction: (callback) => {
    const handler = (_event, action) => callback(action);
    ipcRenderer.on('kexoz:tray-action', handler);
    return () => ipcRenderer.removeListener('kexoz:tray-action', handler);
  },
  setAutoStart: (enabled) => ipcRenderer.invoke('kexoz:set-autostart', enabled),
  listListeningPorts: () => ipcRenderer.invoke('kexoz:list-listening-ports'),
  diagnose: (config) => ipcRenderer.invoke('kexoz:diagnose', config),
  capturePage: (payload) => ipcRenderer.invoke('kexoz:capture-page', payload),
  revealCaptureExtension: () => ipcRenderer.invoke('kexoz:reveal-capture-extension'),
  githubStatus: () => ipcRenderer.invoke('kexoz:github-status'),
  githubConnect: (token) => ipcRenderer.invoke('kexoz:github-connect', token),
  githubDisconnect: () => ipcRenderer.invoke('kexoz:github-disconnect'),
  githubRequest: (payload) => ipcRenderer.invoke('kexoz:github-request', payload),
  linearStatus: () => ipcRenderer.invoke('kexoz:linear-status'),
  linearConnect: (token) => ipcRenderer.invoke('kexoz:linear-connect', token),
  linearDisconnect: () => ipcRenderer.invoke('kexoz:linear-disconnect'),
  linearRequest: (payload) => ipcRenderer.invoke('kexoz:linear-request', payload),
  onTunnelState: (callback) => {
    const handler = (_event, key, state, reason) => callback(key, state, reason);
    ipcRenderer.on('kexoz:tunnel-state', handler);
    return () => ipcRenderer.removeListener('kexoz:tunnel-state', handler);
  },
  onLogEntry: (callback) => {
    const handler = (_event, key, entry) => callback(key, entry);
    ipcRenderer.on('kexoz:tunnel-log', handler);
    return () => ipcRenderer.removeListener('kexoz:tunnel-log', handler);
  },
  adbListDevices: () => ipcRenderer.invoke('kexoz:adb-list-devices'),
  adbDiagnose: () => ipcRenderer.invoke('kexoz:adb-diagnose'),
  mobilePreviewStart: (payload) => ipcRenderer.invoke('kexoz:mobile-preview-start', payload),
  mobilePreviewStop: (sessionId) => ipcRenderer.invoke('kexoz:mobile-preview-stop', sessionId),
  mobilePreviewRevoke: (sessionId) => ipcRenderer.invoke('kexoz:mobile-preview-revoke', sessionId),
  mobileSessions: () => ipcRenderer.invoke('kexoz:mobile-sessions'),
  onMobileState: (callback) => {
    const handler = (_event, sessionId, kind, data) => callback(sessionId, kind, data);
    ipcRenderer.on('kexoz:mobile-state', handler);
    return () => ipcRenderer.removeListener('kexoz:mobile-state', handler);
  },
});
