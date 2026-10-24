const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('kexoz', {
  localRequest: (payload) => ipcRenderer.invoke('kexoz:local-request', payload),
  checkPort: (port) => ipcRenderer.invoke('kexoz:check-port', port),
  notify: (payload) => ipcRenderer.invoke('kexoz:notify', payload),
  startTunnel: (config) => ipcRenderer.invoke('kexoz:start-tunnel', config),
  stopTunnel: () => ipcRenderer.invoke('kexoz:stop-tunnel'),
  updateTray: (tunnels) => ipcRenderer.invoke('kexoz:update-tray', tunnels),
  setAutoStart: (enabled) => ipcRenderer.invoke('kexoz:set-autostart', enabled),
  pickFolder: () => ipcRenderer.invoke('kexoz:pick-folder'),
  inspectFolder: (folder) => ipcRenderer.invoke('kexoz:inspect-folder', folder),
  startFolderServer: (config) => ipcRenderer.invoke('kexoz:start-folder-server', config),
  stopFolderServer: (shareId) => ipcRenderer.invoke('kexoz:stop-folder-server', shareId),
  onTunnelState: (callback) => {
    ipcRenderer.on('kexoz:tunnel-state', (_event, state, msg) => callback(state, msg));
  },
  onLogEntry: (callback) => {
    ipcRenderer.on('kexoz:tunnel-log', (_event, entry) => callback(entry));
  }
});
