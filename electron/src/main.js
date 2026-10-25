const { app, BrowserWindow, shell, protocol, net, ipcMain, Tray, Menu, nativeImage, Notification, dialog, powerMonitor } = require('electron');
const http = require('node:http');
const nodeNet = require('node:net');
const dns = require('node:dns');
const { execFile } = require('node:child_process');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { connectTunnel } = require('./tunnel');
const { createFolderServer, describeFolder } = require('./fileServer');

if (require('electron-squirrel-startup')) {
  app.quit();
}

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'kexoz',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true,
    },
  },
]);

const VITE_DEV_URL = process.env.KEXOZ_VITE_URL || 'http://127.0.0.1:5173';
let tray = null;
let mainWindow = null;
let isQuitting = false;

const SKIP_REQUEST_HEADERS = new Set([
  'host',
  'connection',
  'content-length',
  'transfer-encoding',
  'keep-alive',
  'te',
  'trailer',
  'upgrade',
  'accept-encoding',
  'origin',
  'referer',
]);

const SKIP_RESPONSE_HEADERS = new Set([
  'connection',
  'keep-alive',
  'transfer-encoding',
  'content-encoding',
]);

function sanitizeRequestHeaders(input, port) {
  const headers = {};
  for (const [key, value] of Object.entries(input || {})) {
    if (SKIP_REQUEST_HEADERS.has(String(key).toLowerCase())) continue;
    if (Array.isArray(value)) headers[key] = value.join(', ');
    else if (value != null) headers[key] = String(value);
  }
  headers.Host = `127.0.0.1:${port}`;
  return headers;
}

function normalizeResponseHeaders(raw) {
  const headers = {};
  for (const [key, value] of Object.entries(raw || {})) {
    if (SKIP_RESPONSE_HEADERS.has(String(key).toLowerCase())) continue;
    if (value == null) continue;
    headers[key] = Array.isArray(value) ? value.map(String) : [String(value)];
  }
  return headers;
}

function localRequest({ port, method, path: requestPath, headers, body, bodyBase64 }) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port,
        path: requestPath || '/',
        method: method || 'GET',
        headers: sanitizeRequestHeaders(headers, port),
        timeout: 55_000,
      },
      (res) => {
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => {
          resolve({
            status: res.statusCode || 502,
            headers: normalizeResponseHeaders(res.headers),
            // Raw bytes over IPC — no base64 round-trip.
            body: Buffer.concat(chunks),
          });
        });
      },
    );
    req.on('timeout', () => req.destroy(new Error('Local service timed out')));
    req.on('error', reject);
    if (body && body.length) {
      req.write(Buffer.from(body));
    } else if (bodyBase64) {
      req.write(Buffer.from(bodyBase64, 'base64'));
    }
    req.end();
  });
}

ipcMain.handle('kexoz:local-request', async (_event, payload) => {
  const port = Number(payload?.port);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('Invalid local port');
  }
  try {
    return await localRequest(payload);
  } catch (error) {
    throw new Error(error instanceof Error ? error.message : 'Local service unavailable');
  }
});

const probePort = (port, host = '127.0.0.1') => new Promise((resolve) => {
  const socket = nodeNet.createConnection({ host, port, timeout: 1200 });
  socket.on('connect', () => {
    socket.destroy();
    resolve(true);
  });
  socket.on('error', () => resolve(false));
  socket.on('timeout', () => {
    socket.destroy();
    resolve(false);
  });
});

ipcMain.handle('kexoz:check-port', async (_event, value) => {
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) return false;
  // Dev servers bound to ::1 only (newer Node, Vite) don't answer on 127.0.0.1.
  return (await probePort(port)) || probePort(port, '::1');
});

const run = (file, args) => new Promise((resolve) => {
  execFile(file, args, { timeout: 4000, windowsHide: true, maxBuffer: 4 * 1024 * 1024 }, (error, stdout) => {
    resolve(error ? '' : String(stdout));
  });
});

const SYSTEM_PROCESSES = new Set([
  'system', 'svchost', 'lsass', 'wininit', 'services', 'spoolsv', 'searchhost', 'msedgewebview2',
  'launchd', 'rapportd', 'controlcenter', 'sharingd', 'mdnsresponder', 'identityservicesd',
  'systemd', 'systemd-resolved', 'cupsd', 'avahi-daemon', 'sshd', 'chronyd',
]);

async function listeningProcesses() {
  const found = new Map();
  const add = (port, name) => {
    if (!Number.isInteger(port) || port < 1024 || port > 49151 || found.has(port)) return;
    const base = String(name || '').replace(/\.exe$/i, '');
    if (SYSTEM_PROCESSES.has(base.toLowerCase())) return;
    found.set(port, base);
  };
  if (process.platform === 'win32') {
    const [netstat, tasks] = await Promise.all([run('netstat', ['-ano', '-p', 'TCP']), run('tasklist', ['/FO', 'CSV', '/NH'])]);
    const names = new Map();
    for (const line of tasks.split(/\r?\n/)) {
      const cells = line.match(/"([^"]*)"/g);
      if (cells && cells.length > 1) names.set(cells[1].replace(/"/g, ''), cells[0].replace(/"/g, ''));
    }
    for (const line of netstat.split(/\r?\n/)) {
      const parts = line.trim().split(/\s+/);
      // The state column is localised, but a listening socket always has foreign port 0.
      if (parts[0] !== 'TCP' || parts.length < 5 || !/:0$/.test(parts[2])) continue;
      if (parts[4] === String(process.pid)) continue;
      add(Number(parts[1].split(':').pop()), names.get(parts[4]));
    }
  } else {
    const lsof = await run('lsof', ['-nP', '-iTCP', '-sTCP:LISTEN']);
    for (const line of lsof.split('\n').slice(1)) {
      const parts = line.trim().split(/\s+/);
      if (parts.length < 9 || parts[1] === String(process.pid)) continue;
      add(Number(parts[8].split(':').pop()), parts[0]);
    }
    if (found.size === 0 && process.platform === 'linux') {
      const ss = await run('ss', ['-ltnpH']);
      for (const line of ss.split('\n')) {
        const parts = line.trim().split(/\s+/);
        if (parts.length < 4) continue;
        const name = /users:\(\("([^"]+)"/.exec(line)?.[1];
        add(Number(parts[3].split(':').pop()), name);
      }
    }
  }
  return found;
}

async function dockerPorts() {
  const out = await run('docker', ['ps', '--format', '{{.Names}}|{{.Image}}|{{.Ports}}']);
  const result = [];
  for (const line of out.split(/\r?\n/)) {
    const [name, image, ports] = line.split('|');
    if (!name || !ports) continue;
    for (const match of ports.matchAll(/:(\d+)->(\d+)\/tcp/g)) {
      result.push({ port: Number(match[1]), container: name, image, inner: Number(match[2]) });
    }
  }
  return result;
}

ipcMain.handle('kexoz:list-listening-ports', async () => {
  const [processes, containers] = await Promise.all([listeningProcesses(), dockerPorts()]);
  const own = new Set([...folderServers.values()].map(server => server.port).filter(Boolean));
  const ports = new Map();
  for (const item of containers) {
    if (own.has(item.port) || ports.has(item.port)) continue;
    ports.set(item.port, { port: item.port, label: `${item.container} (Docker, port ${item.inner})`, source: 'docker' });
  }
  for (const [port, name] of processes) {
    if (own.has(port) || ports.has(port)) continue;
    ports.set(port, { port, label: name || 'Unknown app', source: 'process' });
  }
  return [...ports.values()].sort((a, b) => a.port - b.port).slice(0, 40);
});

const timed = async (fn) => {
  const start = Date.now();
  try {
    const detail = await fn();
    return { ok: true, ms: Date.now() - start, detail };
  } catch (error) {
    return { ok: false, ms: Date.now() - start, detail: error instanceof Error ? error.message : String(error) };
  }
};

ipcMain.handle('kexoz:diagnose', async (_event, config) => {
  const apiBase = String(config?.apiBase || '');
  let host = '';
  try { host = new URL(apiBase).host; } catch { throw new Error('Invalid server address'); }
  const hostname = host.split(':')[0];
  const ports = Array.isArray(config?.ports) ? config.ports.map(Number).filter(p => Number.isInteger(p) && p > 0 && p < 65536).slice(0, 20) : [];

  const dnsResult = await timed(async () => {
    const { address } = await dns.promises.lookup(hostname);
    return `${hostname} resolves to ${address}`;
  });
  const apiResult = await timed(async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    try {
      const res = await net.fetch(`${apiBase.replace(/\/$/, '')}/health/live`, { signal: controller.signal });
      if (!res.ok) throw new Error(`Server answered ${res.status}`);
      return 'Kexoz servers are reachable';
    } finally {
      clearTimeout(timer);
    }
  });
  const portResults = await Promise.all(ports.map(async (port) => {
    const open = (await probePort(port)) || (await probePort(port, '::1'));
    return { port, open };
  }));
  const proxy = process.env.HTTPS_PROXY || process.env.https_proxy || process.env.HTTP_PROXY || process.env.http_proxy || '';
  return {
    online: net.isOnline(),
    dns: dnsResult,
    api: apiResult,
    ports: portResults,
    proxy: proxy ? 'A proxy is set in your environment' : '',
  };
});

ipcMain.handle('kexoz:notify', async (_event, { title, body }) => {
  if (!Notification.isSupported()) return false;
  new Notification({ title: String(title || 'Kexoz'), body: String(body || '') }).show();
  return true;
});

ipcMain.handle('kexoz:pick-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Choose a folder to share',
    properties: ['openDirectory'],
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  return describeFolder(result.filePaths[0], os.homedir());
});

ipcMain.handle('kexoz:inspect-folder', async (_event, folder) => {
  if (typeof folder !== 'string' || !path.isAbsolute(folder)) throw new Error('Folder path must be absolute');
  return describeFolder(folder, os.homedir());
});

// One loopback file server per running folder share, keyed by share id.
const folderServers = new Map();

// Download counts survive restarts so a limit can't be reset by restarting the share.
const downloadsFile = () => path.join(app.getPath('userData'), 'folder-downloads.json');
let downloadCounts = null;
const loadDownloadCounts = () => {
  if (downloadCounts) return downloadCounts;
  try {
    downloadCounts = JSON.parse(require('node:fs').readFileSync(downloadsFile(), 'utf8')) || {};
  } catch {
    downloadCounts = {};
  }
  return downloadCounts;
};
let saveTimer = null;
const saveDownloadCounts = () => {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    require('node:fs').promises.writeFile(downloadsFile(), JSON.stringify(downloadCounts || {})).catch(() => {});
  }, 500);
};

ipcMain.handle('kexoz:folder-downloads', async () => ({ ...loadDownloadCounts() }));

ipcMain.handle('kexoz:start-folder-server', async (_event, config) => {
  const shareId = String(config?.shareId || '');
  const root = config?.root;
  if (!shareId || typeof root !== 'string' || !path.isAbsolute(root)) throw new Error('A share id and an absolute folder path are required');
  folderServers.get(shareId)?.close();
  folderServers.delete(shareId);
  const counts = loadDownloadCounts();
  const server = createFolderServer({
    root,
    readOnly: config.readOnly !== false,
    excludes: Array.isArray(config.excludes) ? config.excludes.map(String) : undefined,
    hosts: Array.isArray(config.hosts) ? config.hosts.map(String) : [],
    maxDownloads: Number(config.maxDownloads) || 0,
    downloadsUsed: counts[shareId] || 0,
    onDownload: (count) => {
      counts[shareId] = count;
      saveDownloadCounts();
      sendToWindow('kexoz:folder-download', shareId, count);
    },
  });
  const port = await server.listen();
  folderServers.set(shareId, server);
  return { port };
});

ipcMain.handle('kexoz:stop-folder-server', async (_event, shareId) => {
  folderServers.get(String(shareId))?.close();
  folderServers.delete(String(shareId));
  return true;
});

const tunnels = new Map();

const sendToWindow = (channel, ...args) => {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(channel, ...args);
};

ipcMain.handle('kexoz:start-tunnel', async (_event, config) => {
  const key = config.key || 'legacy';
  tunnels.get(key)?.close();
  tunnels.set(key, connectTunnel({
    tunnelUrl: config.tunnelUrl,
    tunnelType: config.tunnelType,
    port: config.port,
    onStateChange: (state, reason) => sendToWindow('kexoz:tunnel-state', key, state, reason),
    onLogEntry: (entry) => sendToWindow('kexoz:tunnel-log', key, entry),
  }));
  return true;
});

ipcMain.handle('kexoz:stop-tunnel', async (_event, key) => {
  const k = key || 'legacy';
  tunnels.get(k)?.close();
  tunnels.delete(k);
  return true;
});

ipcMain.handle('kexoz:set-tunnel-port', async (_event, key, port) => {
  tunnels.get(key || 'legacy')?.setPort(port);
  return true;
});

ipcMain.handle('kexoz:update-tray', async (event, tunnels) => {
  if (!tray) return false;
  const menuItems = [];
  menuItems.push({ label: 'Show Kexoz', click: () => { mainWindow?.show(); mainWindow?.focus(); } });
  menuItems.push({ label: 'Hide Kexoz', click: () => mainWindow?.hide() });
  
  if (tunnels && tunnels.length > 0) {
    menuItems.push({ type: 'separator' });
    menuItems.push({ label: 'Shares', enabled: false });
    tunnels.forEach(t => {
      const isRunning = activeTunnel && currentConfig && currentConfig.port === t.port;
      const name = typeof t.name === 'string' ? t.name.trim().slice(0, 60) : '';
      menuItems.push({
        label: name ? `${name} (${t.subdomain})` : `${t.subdomain} (:${t.port})`,
        icon: isRunning ? nativeImage.createFromPath(path.join(__dirname, '../assets/green-dot.png')) : undefined,
        submenu: [
          { label: 'Copy URL', click: () => { 
            const domain = t.customDomain ? t.customDomain : `${t.subdomain}.kexoz.dev`; 
            require('electron').clipboard.writeText(`https://${domain}`); 
          }},
        ]
      });
    });
  }

  menuItems.push({ type: 'separator' });
  menuItems.push({ label: 'Quit', click: () => { isQuitting = true; app.quit(); } });
  
  tray.setContextMenu(Menu.buildFromTemplate(menuItems));
  return true;
});

const TITLE_BAR_HEIGHT = 36;
const TITLE_BAR_THEMES = {
  dark: { color: '#202322', symbolColor: '#E9EDE6' },
  light: { color: '#E9EDE6', symbolColor: '#202322' },
};

ipcMain.handle('kexoz:set-titlebar-theme', async (_event, theme) => {
  if (!mainWindow || process.platform === 'darwin') return false;
  const colors = TITLE_BAR_THEMES[theme] || TITLE_BAR_THEMES.dark;
  mainWindow.setTitleBarOverlay({ ...colors, height: TITLE_BAR_HEIGHT });
  return true;
});

ipcMain.handle('kexoz:set-autostart', async (event, enabled) => {
  app.setLoginItemSettings({
    openAtLogin: enabled,
    openAsHidden: true,
  });
  return true;
});

const createWindow = () => {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 960,
    minHeight: 640,
    title: 'Kexoz',
    icon: path.join(__dirname, '../assets/icon.png'),
    backgroundColor: '#202322',
    show: false,
    autoHideMenuBar: true,
    titleBarStyle: 'hidden',
    ...(process.platform === 'darwin'
      ? { trafficLightPosition: { x: 14, y: 12 } }
      : { titleBarOverlay: { ...TITLE_BAR_THEMES.dark, height: TITLE_BAR_HEIGHT } }),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });

  mainWindow.setMenu(null);

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.on('close', (event) => {
    if (isQuitting) return;
    event.preventDefault();
    mainWindow.hide();
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https:') || url.startsWith('http:')) {
      void shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  if (!app.isPackaged) {
    mainWindow.loadURL(VITE_DEV_URL).catch(() => {
      const fallback = path.join(__dirname, '../../frontend/dist/index.html');
      void mainWindow.loadFile(fallback);
    });
    return;
  }

  void mainWindow.loadURL('kexoz://app/');
};

const createTray = () => {
  const icon = nativeImage.createFromPath(path.join(__dirname, '../assets/tray.png'));
  tray = new Tray(icon.isEmpty() ? nativeImage.createEmpty() : icon);
  tray.setToolTip('Kexoz');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Show Kexoz', click: () => { mainWindow?.show(); mainWindow?.focus(); } },
    { label: 'Hide Kexoz', click: () => mainWindow?.hide() },
    { type: 'separator' },
    { label: 'Quit', click: () => { isQuitting = true; app.quit(); } },
  ]));
  tray.on('double-click', () => { mainWindow?.show(); mainWindow?.focus(); });
};

app.whenReady().then(() => {
  if (app.isPackaged) {
    const distRoot = path.join(process.resourcesPath, 'dist');
    protocol.handle('kexoz', (request) => {
      const { pathname } = new URL(request.url);
      let relative = decodeURIComponent(pathname);
      if (!relative || relative === '/') relative = '/index.html';
      const filePath = path.normalize(path.join(distRoot, relative.replace(/^[/\\]+/, '')));
      if (!filePath.startsWith(distRoot)) {
        return new Response('Forbidden', { status: 403 });
      }
      return net.fetch(pathToFileURL(filePath).toString());
    });
  }

  createWindow();
  createTray();

  // Sockets rarely survive sleep; reconnect right away instead of waiting for the silence timeout.
  powerMonitor.on('resume', () => tunnels.forEach(tunnel => tunnel.reconnectNow()));

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  // Keep the tray resident until the user explicitly chooses Quit.
});

app.on('before-quit', () => {
  isQuitting = true;
  folderServers.forEach(server => server.close());
  folderServers.clear();
  tunnels.forEach(tunnel => tunnel.close());
  tunnels.clear();
});
