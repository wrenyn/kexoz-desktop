// Review helpers for the main process: full-page screenshots of the app
// running on this computer, and a GitHub token kept encrypted on disk so the
// renderer never sees it.
const { app, BrowserWindow, ipcMain, net, safeStorage } = require('electron');
const fs = require('node:fs/promises');
const http = require('node:http');
const netSocket = require('node:net');
const path = require('node:path');

const CAPTURE_WIDTHS = [375, 768, 1280, 1440];
const CAPTURE_VIEWPORT_H = 900;
const CAPTURE_MAX_HEIGHT = 8000;
const CAPTURE_MAX_BYTES = 880 * 1024;
const CAPTURE_MAX_IMAGE_WIDTH = 1280;
const CAPTURE_SETTLE_MS = 1200;
const CAPTURE_TIMEOUT_MS = 20000;

const isLocalUrl = (value) => {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' && (url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '[::1]');
  } catch {
    return false;
  }
};

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const withTimeout = (promise, ms, message) => Promise.race([
  promise,
  new Promise((_, reject) => setTimeout(() => reject(new Error(message)), ms)),
]);

const validPort = (value) => Number.isInteger(value) && value >= 1 && value <= 65535;

// cleanRoutes keeps the share's path prefixes (not "/") that point at a valid port.
function cleanRoutes(routes) {
  if (!Array.isArray(routes)) return [];
  return routes
    .map(route => ({ path: String(route && route.path || '').replace(/\/+$/, ''), port: Number(route && route.port) }))
    .filter(route => route.path.startsWith('/') && route.path.length > 1 && validPort(route.port))
    .slice(0, 50);
}

// portForRequest picks the local port the gateway would: the longest matching
// path prefix, else the share's own port.
function portForRequest(routes, fallback, url) {
  const requestPath = String(url || '/').split('?')[0];
  let best = { length: -1, port: fallback };
  for (const route of routes) {
    if ((requestPath === route.path || requestPath.startsWith(`${route.path}/`)) && route.path.length > best.length) {
      best = { length: route.path.length, port: route.port };
    }
  }
  return best.port;
}

// startRouteProxy serves the app on a throwaway local port with the share's
// path routes applied, so a page that calls /api renders with its backend.
function startRouteProxy(fallback, routes) {
  const server = http.createServer((req, res) => {
    const target = portForRequest(routes, fallback, req.url);
    const headers = { ...req.headers, host: `localhost:${target}` };
    const upstream = http.request({ host: 'localhost', port: target, method: req.method, path: req.url, headers }, reply => {
      res.writeHead(reply.statusCode || 502, reply.headers);
      reply.pipe(res);
    });
    upstream.on('error', () => {
      if (!res.headersSent) res.writeHead(502, { 'Content-Type': 'text/plain' });
      res.end(`Nothing is running on localhost:${target}`);
    });
    req.pipe(upstream);
  });
  const upgraded = new Set();
  server.stop = () => {
    for (const socket of upgraded) socket.destroy();
    server.closeAllConnections?.();
    server.close();
  };
  server.on('upgrade', (req, socket, head) => {
    const target = portForRequest(routes, fallback, req.url);
    const upstream = netSocket.connect(target, 'localhost', () => {
      const lines = [`${req.method} ${req.url} HTTP/1.1`];
      for (let i = 0; i < req.rawHeaders.length; i += 2) {
        const name = req.rawHeaders[i];
        lines.push(`${name}: ${name.toLowerCase() === 'host' ? `localhost:${target}` : req.rawHeaders[i + 1]}`);
      }
      upstream.write(`${lines.join('\r\n')}\r\n\r\n`);
      if (head && head.length) upstream.write(head);
      socket.pipe(upstream).pipe(socket);
    });
    upgraded.add(socket).add(upstream);
    upstream.on('error', () => socket.destroy());
    socket.on('error', () => upstream.destroy());
    upstream.on('close', () => { upgraded.delete(upstream); socket.destroy(); });
    socket.on('close', () => { upgraded.delete(socket); upstream.destroy(); });
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

// capturePage loads a page of the local app in a hidden window and returns a
// JPEG of the whole page, up to CAPTURE_MAX_HEIGHT tall.
async function capturePage({ port, path: pagePath, width, routes }) {
  const localPort = Number(port);
  if (!validPort(localPort)) throw new Error('Invalid local port');
  const viewportW = CAPTURE_WIDTHS.includes(Number(width)) ? Number(width) : 1280;
  const route = typeof pagePath === 'string' && pagePath.startsWith('/') ? pagePath.split('#')[0] : '/';
  const pathRoutes = cleanRoutes(routes);
  const proxy = pathRoutes.length > 0 ? await startRouteProxy(localPort, pathRoutes) : null;
  try {
    const servedPort = proxy ? proxy.address().port : localPort;
    return await captureUrl(`http://localhost:${servedPort}${route}`, viewportW, route, portForRequest(pathRoutes, localPort, route));
  } finally {
    if (proxy) proxy.stop();
  }
}

async function captureUrl(url, viewportW, route, localPort) {
  const win = new BrowserWindow({
    show: false,
    width: viewportW,
    height: CAPTURE_VIEWPORT_H,
    webPreferences: {
      partition: 'kexoz-capture',
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
      // Hidden windows stop painting after the first one, so later
      // Page.captureScreenshot calls never finish; offscreen rendering keeps frames coming.
      offscreen: true,
    },
  });
  const contents = win.webContents;
  contents.setWindowOpenHandler(() => ({ action: 'deny' }));
  contents.on('will-navigate', (event, target) => { if (!isLocalUrl(target)) event.preventDefault(); });
  contents.setAudioMuted(true);

  try {
    await withTimeout(win.loadURL(url), CAPTURE_TIMEOUT_MS, `localhost:${localPort} took too long to load`);
    await delay(CAPTURE_SETTLE_MS);
    contents.debugger.attach('1.3');
    const send = (method, params) => withTimeout(contents.debugger.sendCommand(method, params), CAPTURE_TIMEOUT_MS, 'The page stopped responding while being captured');
    try {
      await send('Emulation.setDeviceMetricsOverride', {
        width: viewportW, height: CAPTURE_VIEWPORT_H, deviceScaleFactor: 1, mobile: viewportW < 600,
      });
      const metrics = await send('Page.getLayoutMetrics');
      const size = metrics.cssContentSize || metrics.contentSize || { width: viewportW, height: CAPTURE_VIEWPORT_H };
      const pageW = Math.max(1, Math.min(Math.ceil(size.width), viewportW));
      let pageH = Math.max(1, Math.min(Math.ceil(size.height), CAPTURE_MAX_HEIGHT));
      const scale = Math.min(1, CAPTURE_MAX_IMAGE_WIDTH / pageW);
      let quality = 72;
      for (let attempt = 0; attempt < 5; attempt++) {
        const shot = await send('Page.captureScreenshot', {
          format: 'jpeg',
          quality,
          captureBeyondViewport: true,
          clip: { x: 0, y: 0, width: pageW, height: pageH, scale },
        });
        const data = Buffer.from(shot.data, 'base64');
        if (data.length <= CAPTURE_MAX_BYTES) {
          return { data, width: Math.round(pageW * scale), height: Math.round(pageH * scale), scale, viewportW, path: route };
        }
        if (quality > 45) quality -= 15;
        else pageH = Math.max(CAPTURE_VIEWPORT_H, Math.floor(pageH * 0.7));
      }
      throw new Error('That page is too large to capture.');
    } finally {
      try { contents.debugger.detach(); } catch { /* already gone */ }
    }
  } finally {
    if (!win.isDestroyed()) win.destroy();
  }
}

// ── GitHub ───────────────────────────────────────────────────────────────

const tokenFile = () => path.join(app.getPath('userData'), 'github-token.bin');

async function readToken() {
  try {
    const raw = await fs.readFile(tokenFile());
    if (!safeStorage.isEncryptionAvailable()) return '';
    return safeStorage.decryptString(raw);
  } catch {
    return '';
  }
}

async function githubFetch(token, method, apiPath, body) {
  const res = await net.fetch(`https://api.github.com${apiPath}`, {
    method,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'Kexoz-Desktop',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = null; }
  if (!res.ok) {
    const message = data && data.message ? data.message : `GitHub answered ${res.status}`;
    const error = new Error(res.status === 401 ? 'GitHub rejected the token. Connect again with a new one.' : res.status === 404 ? 'GitHub couldn\u2019t find that repository, or the token can\u2019t see it.' : message);
    throw error;
  }
  return data;
}

// Only what the review workflow needs: reading the user and repositories,
// and reading or writing issues, pull requests and commits.
const ALLOWED_GITHUB = [
  { method: 'GET', pattern: /^\/user(\/repos)?(\?[\w=&%.-]*)?$/ },
  { method: 'GET', pattern: /^\/repos\/[\w.-]+\/[\w.-]+(\/(issues|pulls|commits)(\/\d+)?)?(\?[\w=&%.-]*)?$/ },
  { method: 'POST', pattern: /^\/repos\/[\w.-]+\/[\w.-]+\/issues(\/\d+\/comments)?$/ },
  { method: 'PATCH', pattern: /^\/repos\/[\w.-]+\/[\w.-]+\/issues\/\d+$/ },
];

function registerReviewHandlers() {
  ipcMain.handle('kexoz:capture-page', async (_event, payload) => {
    try {
      return await capturePage(payload || {});
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Capture failed';
      if (/ERR_CONNECTION_REFUSED/.test(message)) throw new Error(`Nothing is running on localhost:${payload && payload.port}`);
      throw new Error(message);
    }
  });

  ipcMain.handle('kexoz:github-status', async () => {
    const token = await readToken();
    if (!token) return { connected: false, login: '', encrypted: safeStorage.isEncryptionAvailable() };
    try {
      const user = await githubFetch(token, 'GET', '/user');
      return { connected: true, login: user.login || '', encrypted: true };
    } catch (error) {
      return { connected: false, login: '', encrypted: true, error: error instanceof Error ? error.message : String(error) };
    }
  });

  ipcMain.handle('kexoz:github-connect', async (_event, value) => {
    const token = String(value || '').trim();
    if (!/^(gh[pousr]_|github_pat_)[\w]+$/.test(token)) throw new Error('That doesn\u2019t look like a GitHub token.');
    if (!safeStorage.isEncryptionAvailable()) throw new Error('This computer can\u2019t store the token securely.');
    const user = await githubFetch(token, 'GET', '/user');
    await fs.mkdir(app.getPath('userData'), { recursive: true });
    await fs.writeFile(tokenFile(), safeStorage.encryptString(token), { mode: 0o600 });
    return { connected: true, login: user.login || '', encrypted: true };
  });

  ipcMain.handle('kexoz:github-disconnect', async () => {
    await fs.rm(tokenFile(), { force: true });
    return true;
  });

  ipcMain.handle('kexoz:github-request', async (_event, payload) => {
    const method = String(payload && payload.method || 'GET').toUpperCase();
    const apiPath = String(payload && payload.path || '');
    if (!ALLOWED_GITHUB.some(rule => rule.method === method && rule.pattern.test(apiPath))) {
      throw new Error('That GitHub request isn\u2019t allowed.');
    }
    const token = await readToken();
    if (!token) throw new Error('Connect GitHub first.');
    return githubFetch(token, method, apiPath, payload && payload.body);
  });
}

module.exports = { registerReviewHandlers, isLocalUrl, portForRequest, startRouteProxy };
