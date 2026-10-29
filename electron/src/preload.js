const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('kexoz', {
  platform: process.platform,
  setTitleBarTheme: (theme) => ipcRenderer.invoke('kexoz:set-titlebar-theme', theme),
  localRequest: (payload) => ipcRenderer.invoke('kexoz:local-request', payload),
  checkPort: (port) => ipcRenderer.invoke('kexoz:check-port', port),
  notify: (payload) => ipcRenderer.invoke('kexoz:notify', payload),
  startTunnel: (config) => ipcRenderer.invoke('kexoz:start-tunnel', config),
  stopTunnel: (key) => ipcRenderer.invoke('kexoz:stop-tunnel', key),
  setTunnelPort: (key, port) => ipcRenderer.invoke('kexoz:set-tunnel-port', key, port),
  updateTray: (tunnels) => ipcRenderer.invoke('kexoz:update-tray', tunnels),
  setAutoStart: (enabled) => ipcRenderer.invoke('kexoz:set-autostart', enabled),
  listListeningPorts: () => ipcRenderer.invoke('kexoz:list-listening-ports'),
  diagnose: (config) => ipcRenderer.invoke('kexoz:diagnose', config),
  capturePage: (payload) => ipcRenderer.invoke('kexoz:capture-page', payload),
  githubStatus: () => ipcRenderer.invoke('kexoz:github-status'),
  githubConnect: (token) => ipcRenderer.invoke('kexoz:github-connect', token),
  githubDisconnect: () => ipcRenderer.invoke('kexoz:github-disconnect'),
  githubRequest: (payload) => ipcRenderer.invoke('kexoz:github-request', payload),
  onTunnelState: (callback) => {
    const handler = (_event, key, state, reason) => callback(key, state, reason);
    ipcRenderer.on('kexoz:tunnel-state', handler);
    return () => ipcRenderer.removeListener('kexoz:tunnel-state', handler);
  },
  onLogEntry: (callback) => {
    const handler = (_event, key, entry) => callback(key, entry);
    ipcRenderer.on('kexoz:tunnel-log', handler);
    return () => ipcRenderer.removeListener('kexoz:tunnel-log', handler);
  }
});
