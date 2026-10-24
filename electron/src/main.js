const { app, BrowserWindow, shell, protocol, net, ipcMain, Tray, Menu, nativeImage, Notification, dialog } = require('electron');
const http = require('node:http');
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

ipcMain.handle('kexoz:check-port', async (_event, value) => {
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) return false;
  return new Promise((resolve) => {
    const socket = net.createConnection({ host: '127.0.0.1', port, timeout: 1200 });
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

ipcMain.handle('kexoz:start-folder-server', async (_event, config) => {
  const shareId = String(config?.shareId || '');
  const root = config?.root;
  if (!shareId || typeof root !== 'string' || !path.isAbsolute(root)) throw new Error('A share id and an absolute folder path are required');
  folderServers.get(shareId)?.close();
  folderServers.delete(shareId);
  const server = createFolderServer({
    root,
    readOnly: config.readOnly !== false,
    excludes: Array.isArray(config.excludes) ? config.excludes.map(String) : undefined,
    hosts: Array.isArray(config.hosts) ? config.hosts.map(String) : [],
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

let activeTunnel = null;
let currentConfig = null;

ipcMain.handle('kexoz:start-tunnel', async (event, config) => {
  if (activeTunnel) {
    activeTunnel.close();
  }
  currentConfig = config;
  activeTunnel = connectTunnel({
    tunnelUrl: config.tunnelUrl,
    tunnelType: config.tunnelType,
    getPort: () => config.port,
    onStateChange: (state, msg) => {
      if (mainWindow) {
        mainWindow.webContents.send('kexoz:tunnel-state', state, msg);
      }
    },
    onLogEntry: (entry) => {
      if (mainWindow) {
        mainWindow.webContents.send('kexoz:tunnel-log', entry);
      }
    }
  });
  return true;
});

ipcMain.handle('kexoz:stop-tunnel', async () => {
  if (activeTunnel) {
    activeTunnel.close();
    activeTunnel = null;
  }
  return true;
});

ipcMain.handle('kexoz:update-tray', async (event, tunnels) => {
  if (!tray) return false;
  const menuItems = [];
  menuItems.push({ label: 'Show Kexoz', click: () => { mainWindow?.show(); mainWindow?.focus(); } });
  menuItems.push({ label: 'Hide Kexoz', click: () => mainWindow?.hide() });
  
  if (tunnels && tunnels.length > 0) {
    menuItems.push({ type: 'separator' });
    menuItems.push({ label: 'Saved Tunnels', enabled: false });
    tunnels.forEach(t => {
      const isRunning = activeTunnel && currentConfig && currentConfig.port === t.port;
      menuItems.push({
        label: `${t.subdomain} (:${t.port})`,
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
    backgroundColor: '#202322',
    show: false,
    autoHideMenuBar: true,
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
  const icon = nativeImage.createFromPath(path.join(__dirname, '../assets/logo.png'));
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
});
