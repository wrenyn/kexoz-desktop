// Mobile Preview agent: ADB discovery, local preview server, allowlisted input.
// Media MVP: MJPEG from adb screencap. Prefer scrcpy when present (detected, not required).
const { ipcMain } = require('electron');
const { spawn, execFile } = require('node:child_process');
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { URL } = require('node:url');

const sessions = new Map();

function run(file, args, opts = {}) {
  return new Promise((resolve) => {
    execFile(file, args, {
      windowsHide: true,
      timeout: opts.timeout ?? 8000,
      maxBuffer: opts.maxBuffer ?? 4 * 1024 * 1024,
      env: { ...process.env, ...(opts.env || {}) },
    }, (err, stdout, stderr) => {
      resolve({
        ok: !err,
        code: err && err.code,
        stdout: String(stdout || ''),
        stderr: String(stderr || ''),
        error: err ? String(err.message || err) : '',
      });
    });
  });
}

function candidateAdbPaths() {
  const home = os.homedir();
  const local = process.env.LOCALAPPDATA || '';
  const list = [
    process.env.KEXOZ_ADB_PATH,
    process.env.ANDROID_HOME && path.join(process.env.ANDROID_HOME, 'platform-tools', process.platform === 'win32' ? 'adb.exe' : 'adb'),
    process.env.ANDROID_SDK_ROOT && path.join(process.env.ANDROID_SDK_ROOT, 'platform-tools', process.platform === 'win32' ? 'adb.exe' : 'adb'),
    local && path.join(local, 'Android', 'Sdk', 'platform-tools', 'adb.exe'),
    path.join(home, 'Library', 'Android', 'sdk', 'platform-tools', 'adb'),
    path.join(home, 'Android', 'Sdk', 'platform-tools', 'adb'),
    'adb',
  ].filter(Boolean);
  return [...new Set(list)];
}

async function resolveAdb() {
  for (const candidate of candidateAdbPaths()) {
    if (candidate !== 'adb' && !fs.existsSync(candidate)) continue;
    const version = await run(candidate, ['version'], { timeout: 4000 });
    if (version.ok && /Android Debug Bridge/i.test(version.stdout)) {
      return { path: candidate, version: version.stdout.split('\n')[0].trim() };
    }
  }
  return null;
}

async function adb(adbPath, args, opts) {
  return run(adbPath, args, opts);
}

function parseDevices(stdout) {
  const devices = [];
  for (const line of stdout.split(/\r?\n/)) {
    if (!line.trim() || line.startsWith('List of devices')) continue;
    const parts = line.trim().split(/\s+/);
    if (parts.length < 2) continue;
    const [serial, state] = parts;
    const meta = {};
    for (const token of parts.slice(2)) {
      const i = token.indexOf(':');
      if (i > 0) meta[token.slice(0, i)] = token.slice(i + 1);
    }
    const emulator = serial.startsWith('emulator-') || /emulator/i.test(meta.product || '');
    devices.push({
      id: serial,
      serial,
      state,
      model: meta.model || meta.device || (emulator ? 'Android Emulator' : 'Android Device'),
      product: meta.product || '',
      transport: meta.usb ? 'usb' : (meta.product || '').includes('emulator') || emulator ? 'emulator' : 'usb',
      emulator,
      platform: 'android',
      capabilities: {
        screen: true,
        remoteInput: state === 'device',
        keyboard: state === 'device',
        rotation: state === 'device',
        viewOnly: false,
      },
    });
  }
  return devices;
}

async function deviceProps(adbPath, serial) {
  const props = await adb(adbPath, ['-s', serial, 'shell', 'getprop'], { timeout: 10000 });
  const map = {};
  if (props.ok) {
    for (const line of props.stdout.split(/\r?\n/)) {
      const m = line.match(/^\[([^\]]+)\]: \[([^\]]*)\]/);
      if (m) map[m[1]] = m[2];
    }
  }
  const size = await adb(adbPath, ['-s', serial, 'shell', 'wm', 'size'], { timeout: 5000 });
  let width = 0;
  let height = 0;
  const sm = (size.stdout || '').match(/(\d+)\s*x\s*(\d+)/i);
  if (sm) {
    width = Number(sm[1]);
    height = Number(sm[2]);
  }
  return {
    androidVersion: map['ro.build.version.release'] || '',
    apiLevel: map['ro.build.version.sdk'] || '',
    manufacturer: map['ro.product.manufacturer'] || '',
    model: map['ro.product.model'] || map['ro.product.name'] || '',
    width,
    height,
  };
}

function clamp01(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return 0;
  return Math.min(1, Math.max(0, x));
}

async function sendAllowlistedInput(adbPath, serial, size, event) {
  if (!event || typeof event !== 'object') return { ok: false, message: 'Invalid input.' };
  const type = String(event.type || '');
  const w = size.width || 1080;
  const h = size.height || 1920;

  switch (type) {
    case 'tap': {
      const x = Math.round(clamp01(event.x) * (w - 1));
      const y = Math.round(clamp01(event.y) * (h - 1));
      return adb(adbPath, ['-s', serial, 'shell', 'input', 'tap', String(x), String(y)]);
    }
    case 'long_press': {
      const x = Math.round(clamp01(event.x) * (w - 1));
      const y = Math.round(clamp01(event.y) * (h - 1));
      const ms = Math.min(3000, Math.max(400, Number(event.durationMs) || 800));
      return adb(adbPath, ['-s', serial, 'shell', 'input', 'swipe', String(x), String(y), String(x), String(y), String(ms)]);
    }
    case 'swipe': {
      const x1 = Math.round(clamp01(event.x1 ?? event.x) * (w - 1));
      const y1 = Math.round(clamp01(event.y1 ?? event.y) * (h - 1));
      const x2 = Math.round(clamp01(event.x2) * (w - 1));
      const y2 = Math.round(clamp01(event.y2) * (h - 1));
      const ms = Math.min(2000, Math.max(80, Number(event.durationMs) || 300));
      return adb(adbPath, ['-s', serial, 'shell', 'input', 'swipe', String(x1), String(y1), String(x2), String(y2), String(ms)]);
    }
    case 'key': {
      const key = String(event.key || '').toLowerCase();
      const map = {
        back: '4', home: '3', enter: '66', backspace: '67',
        tab: '61', escape: '111', del: '67',
      };
      if (map[key]) return adb(adbPath, ['-s', serial, 'shell', 'input', 'keyevent', map[key]]);
      if (/^\d+$/.test(key)) return adb(adbPath, ['-s', serial, 'shell', 'input', 'keyevent', key]);
      return { ok: false, message: 'Unsupported key.' };
    }
    case 'text': {
      // Escape for adb shell input text: spaces as %s, strip dangerous chars.
      const raw = String(event.text || '').slice(0, 200);
      const escaped = raw.replace(/[%\s'"\\$`|&;<>()]/g, (ch) => {
        if (ch === ' ') return '%s';
        if (ch === '%') return '';
        return '';
      });
      if (!escaped) return { ok: true, stdout: '' };
      return adb(adbPath, ['-s', serial, 'shell', 'input', 'text', escaped]);
    }
    case 'rotate': {
      const orient = String(event.orientation || 'landscape');
      // 0 portrait, 1 landscape
      const value = orient === 'portrait' ? '0' : '1';
      await adb(adbPath, ['-s', serial, 'shell', 'settings', 'put', 'system', 'accelerometer_rotation', '0']);
      return adb(adbPath, ['-s', serial, 'shell', 'settings', 'put', 'system', 'user_rotation', value]);
    }
    default:
      return { ok: false, message: 'Unsupported input type.' };
  }
}

function viewerHtml(info) {
  const title = info.model || info.serial || 'Android Preview';
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${title} · Kexoz</title>
<style>
:root{--bg:#0c100c;--panel:#151B15;--elev:#1a221a;--line:#303A30;--text:#EDF2E9;--muted:#9AA894;--lime:#B6F36B;--danger:#e35d5d;--bezel:#1c241c}
*{box-sizing:border-box}
body{margin:0;min-height:100vh;display:flex;flex-direction:column;color:var(--text);font:14px/1.45 "Segoe UI",system-ui,sans-serif;background:
  radial-gradient(1200px 600px at 20% -10%, rgba(182,243,107,.08), transparent 55%),
  radial-gradient(900px 500px at 100% 0%, rgba(48,58,48,.55), transparent 50%),
  var(--bg)}
header{display:flex;gap:12px;align-items:center;justify-content:space-between;padding:14px 18px;border-bottom:1px solid var(--line);background:rgba(21,27,21,.92);backdrop-filter:blur(8px)}
.brand{display:flex;flex-direction:column;gap:2px}
.brand strong{font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:var(--lime)}
header h1{font-size:16px;margin:0;font-weight:650}
.meta{color:var(--muted);font-size:12px}
.badges{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
main{flex:1;display:grid;grid-template-columns:minmax(0,1fr) minmax(260px,340px);gap:20px;align-items:start;justify-content:center;padding:24px;max-width:1100px;width:100%;margin:0 auto}
@media (max-width:860px){main{grid-template-columns:1fr;padding:16px}}
.stage{display:flex;flex-direction:column;align-items:center;gap:12px}
.bezel{background:linear-gradient(160deg,#222a22,#121812);border:1px solid #3a453a;border-radius:28px;padding:14px 12px 18px;box-shadow:0 18px 50px rgba(0,0,0,.45)}
.notch{width:36%;height:8px;border-radius:999px;background:#0a0e0a;margin:0 auto 10px}
.frame{position:relative;background:#000;border-radius:16px;overflow:hidden;width:min(72vw,360px);aspect-ratio:9/19.5;touch-action:none;user-select:none;cursor:crosshair}
.frame.controlling{outline:2px solid var(--lime);outline-offset:2px}
.frame img{display:block;width:100%;height:100%;object-fit:contain;background:#000;pointer-events:none}
.home-pill{width:34%;height:5px;border-radius:999px;background:#2a332a;margin:12px auto 0}
.bar{display:flex;gap:8px;flex-wrap:wrap;justify-content:center}
button{background:var(--elev);border:1px solid var(--line);color:var(--text);border-radius:10px;padding:9px 12px;cursor:pointer;font:inherit}
button:hover{border-color:#4a574a}
button.primary{background:var(--lime);color:#101310;border-color:var(--lime);font-weight:650}
button:disabled{opacity:.45;cursor:not-allowed}
.badge{font-size:11px;padding:4px 9px;border-radius:999px;border:1px solid var(--line);color:var(--muted);background:var(--panel)}
.badge.on{border-color:color-mix(in srgb,var(--lime) 55%,transparent);color:var(--lime);background:rgba(182,243,107,.08)}
.badge.warn{border-color:color-mix(in srgb,var(--danger) 45%,transparent);color:var(--danger)}
aside{background:var(--panel);border:1px solid var(--line);border-radius:16px;padding:16px;display:flex;flex-direction:column;gap:10px}
aside h2{font-size:13px;margin:0;letter-spacing:.02em}
aside textarea{width:100%;min-height:88px;background:#101310;border:1px solid var(--line);border-radius:10px;color:var(--text);padding:10px;resize:vertical;font:inherit}
.status{font-size:12px;color:var(--muted)}
.actions{display:flex;gap:8px;flex-wrap:wrap}
.footer{padding:12px 18px 18px;border-top:1px solid var(--line);display:flex;justify-content:center}
</style>
</head>
<body>
<header>
  <div class="brand">
    <strong>Kexoz</strong>
    <h1>Android Preview</h1>
    <div class="meta" id="meta">${title}</div>
  </div>
  <div class="badges">
    <span class="badge" id="liveBadge">connecting</span>
    <span class="badge" id="capBadge">loading</span>
    <span class="badge" id="ctrlBadge">viewer</span>
  </div>
</header>
<main>
  <div class="stage">
    <div class="bezel">
      <div class="notch" aria-hidden="true"></div>
      <div class="frame" id="frame"><img id="screen" alt="Android device screen"/></div>
      <div class="home-pill" aria-hidden="true"></div>
    </div>
    <div class="bar">
      <button type="button" id="back">Back</button>
      <button type="button" id="home">Home</button>
      <button type="button" id="rotate">Rotate</button>
      <button type="button" id="fullscreen">Full screen</button>
      <button type="button" id="reconnect">Reconnect</button>
    </div>
  </div>
  <aside>
    <h2>Session</h2>
    <p class="meta">Request control to tap, swipe, and type on the real device. Only one controller at a time.</p>
    <div class="actions">
      <button type="button" class="primary" id="requestCtrl">Request control</button>
      <button type="button" id="releaseCtrl">Release</button>
    </div>
    <h2>Feedback</h2>
    <p class="meta">Capture a screenshot note tied to this preview. Full discussion stays in the Kexoz workspace.</p>
    <textarea id="note" placeholder="What should change?"></textarea>
    <div class="actions">
      <button type="button" class="primary" id="shot">Screenshot note</button>
    </div>
    <div class="status" id="status">Connecting…</div>
  </aside>
</main>
<div class="footer meta">ADB stays on the developer machine · Encrypted share link · Obsidian + Lime</div>
<script>
(function(){
  const img = document.getElementById('screen');
  const frame = document.getElementById('frame');
  const status = document.getElementById('status');
  const ctrlBadge = document.getElementById('ctrlBadge');
  const capBadge = document.getElementById('capBadge');
  const liveBadge = document.getElementById('liveBadge');
  let info = null;
  let controlling = false;
  let pointer = null;

  function setStatus(t){ status.textContent = t; }
  function setLive(ok, label){
    liveBadge.textContent = label;
    liveBadge.className = 'badge ' + (ok ? 'on' : 'warn');
  }

  async function refreshInfo(){
    const r = await fetch('/__mobile/info', { credentials:'include' });
    info = await r.json();
    document.getElementById('meta').textContent =
      [info.model, info.androidVersion && ('Android '+info.androidVersion), info.width && (info.width+'×'+info.height)].filter(Boolean).join(' · ');
    const caps = info.capabilities || {};
    capBadge.textContent = caps.remoteInput ? 'interactive' : 'view-only';
    capBadge.className = 'badge ' + (caps.remoteInput ? 'on' : 'warn');
    controlling = !!info.youControl;
    ctrlBadge.textContent = controlling ? 'controller' : (info.controllerId ? 'viewer' : 'open');
    ctrlBadge.className = 'badge ' + (controlling ? 'on' : '');
    frame.classList.toggle('controlling', controlling);
    document.getElementById('back').disabled = !controlling;
    document.getElementById('home').disabled = !controlling;
    document.getElementById('rotate').disabled = !controlling;
  }

  function attachStream(){
    img.src = '/__mobile/stream.mjpeg?t=' + Date.now();
  }
  attachStream();
  img.onload = () => { setStatus(controlling ? 'Live · you have control' : 'Live'); setLive(true, 'live'); };
  img.onerror = () => { setStatus('Stream interrupted — tap Reconnect'); setLive(false, 'offline'); };
  document.getElementById('reconnect').onclick = () => { setStatus('Reconnecting…'); attachStream(); void refreshInfo(); };

  function normEvent(clientX, clientY){
    const rect = img.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    const x = (clientX - rect.left) / rect.width;
    const y = (clientY - rect.top) / rect.height;
    if (x < 0 || y < 0 || x > 1 || y > 1) return null;
    return { x, y };
  }

  async function postInput(body){
    if (!controlling) { setStatus('Request control to interact.'); return; }
    const r = await fetch('/__mobile/input', {
      method:'POST', credentials:'include',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify(body)
    });
    const data = await r.json().catch(()=>({}));
    if (!r.ok) setStatus(data.message || 'Input failed');
  }

  frame.addEventListener('pointerdown', (ev) => {
    const p = normEvent(ev.clientX, ev.clientY);
    if (!p) return;
    frame.setPointerCapture(ev.pointerId);
    pointer = { ...p, t: Date.now(), id: ev.pointerId };
  });
  frame.addEventListener('pointerup', (ev) => {
    if (!pointer || pointer.id !== ev.pointerId) return;
    const p = normEvent(ev.clientX, ev.clientY) || pointer;
    const dt = Date.now() - pointer.t;
    const dx = p.x - pointer.x, dy = p.y - pointer.y;
    if (Math.hypot(dx, dy) > 0.02) {
      void postInput({ type:'swipe', x1: pointer.x, y1: pointer.y, x2: p.x, y2: p.y, durationMs: Math.min(800, Math.max(80, dt)) });
    } else if (dt > 500) {
      void postInput({ type:'long_press', x: p.x, y: p.y, durationMs: dt });
    } else {
      void postInput({ type:'tap', x: p.x, y: p.y });
    }
    pointer = null;
  });

  window.addEventListener('keydown', (ev) => {
    if (!controlling) return;
    if (ev.target && (ev.target.tagName === 'TEXTAREA' || ev.target.tagName === 'INPUT')) return;
    if (ev.key === 'Backspace') { ev.preventDefault(); void postInput({ type:'key', key:'backspace' }); return; }
    if (ev.key === 'Enter') { ev.preventDefault(); void postInput({ type:'key', key:'enter' }); return; }
    if (ev.key.length === 1 && !ev.ctrlKey && !ev.metaKey) {
      ev.preventDefault();
      void postInput({ type:'text', text: ev.key });
    }
  });

  document.getElementById('back').onclick = () => postInput({ type:'key', key:'back' });
  document.getElementById('home').onclick = () => postInput({ type:'key', key:'home' });
  document.getElementById('rotate').onclick = () => postInput({ type:'rotate', orientation:'landscape' });
  document.getElementById('fullscreen').onclick = () => frame.requestFullscreen?.();
  document.getElementById('requestCtrl').onclick = async () => {
    const r = await fetch('/__mobile/control/request', { method:'POST', credentials:'include' });
    const data = await r.json();
    setStatus(data.message || (r.ok ? 'You have control' : 'Could not take control'));
    await refreshInfo();
  };
  document.getElementById('releaseCtrl').onclick = async () => {
    await fetch('/__mobile/control/release', { method:'POST', credentials:'include' });
    await refreshInfo();
  };
  document.getElementById('shot').onclick = async () => {
    const note = document.getElementById('note').value.trim() || 'Screenshot from mobile preview';
    setStatus('Capturing…');
    const r = await fetch('/__mobile/screenshot', {
      method:'POST', credentials:'include',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ body: note })
    });
    const data = await r.json().catch(()=>({}));
    if (!r.ok || !data.dataUrl) {
      setStatus(data.message || 'Screenshot failed');
      return;
    }
    try {
      const up = await fetch('/__kexoz/attachments', {
        method:'POST', credentials:'include',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({
          kind:'image', fileName:'mobile-preview.png', dataUrl: data.dataUrl,
          width: data.width || 0, height: data.height || 0
        })
      });
      const att = await up.json().catch(()=>({}));
      if (!up.ok || !att.attachment || !att.attachment.id) {
        setStatus((att && att.message) || 'Captured locally, but feedback upload needs an active preview session.');
        return;
      }
      const fb = await fetch('/__kexoz/feedback', {
        method:'POST', credentials:'include',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({
          body: note,
          title: 'Mobile preview',
          path: '/',
          selector: '',
          offsetX: 0, offsetY: 0,
          pageX: 0, pageY: 0,
          viewportW: data.width || info?.width || 0,
          viewportH: data.height || info?.height || 0,
          pixelRatio: 1,
          anchorType: 'point',
          anchorPayload: { source: 'mobile-preview', normalized: true },
          attachmentIds: [att.attachment.id]
        })
      });
      const created = await fb.json().catch(()=>({}));
      if (!fb.ok) {
        setStatus((created && created.message) || 'Could not create feedback note.');
        return;
      }
      document.getElementById('note').value = '';
      setStatus('Feedback submitted with screenshot.');
    } catch (err) {
      setStatus('Capture OK, but feedback APIs are unavailable on this host yet.');
    }
  };

  refreshInfo().catch(() => setStatus('Could not load device info'));
  setInterval(() => { refreshInfo().catch(()=>{}); }, 4000);
})();
</script>
</body>
</html>`;
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > 256 * 1024) {
        reject(new Error('body too large'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      try {
        resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {});
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

function viewerId(req) {
  const cookie = String(req.headers.cookie || '');
  const m = cookie.match(/(?:^|;\s*)kexoz_mvid=([^;]+)/);
  if (m) return decodeURIComponent(m[1]);
  return '';
}

function ensureViewerCookie(req, res) {
  let id = viewerId(req);
  if (!id) {
    id = `v_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
    res.setHeader('Set-Cookie', `kexoz_mvid=${encodeURIComponent(id)}; Path=/; SameSite=Lax`);
  }
  return id;
}

async function capturePng(adbPath, serial) {
  return new Promise((resolve) => {
    const child = spawn(adbPath, ['-s', serial, 'exec-out', 'screencap', '-p'], {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const chunks = [];
    let bytes = 0;
    child.stdout.on('data', (c) => {
      bytes += c.length;
      if (bytes > 12 * 1024 * 1024) {
        child.kill();
        return;
      }
      chunks.push(c);
    });
    child.on('close', (code) => {
      if (code !== 0 || !chunks.length) resolve(null);
      else resolve(Buffer.concat(chunks));
    });
    child.on('error', () => resolve(null));
  });
}

function startLocalServer(session) {
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url || '/', 'http://127.0.0.1');
      const vid = ensureViewerCookie(req, res);

      if (url.pathname === '/' || url.pathname === '/index.html') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
        res.end(viewerHtml(session.info));
        return;
      }

      if (url.pathname === '/__mobile/info') {
        const youControl = session.controllerId === vid;
        res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
        res.end(JSON.stringify({
          ...session.info,
          capabilities: session.info.capabilities,
          controllerId: session.controllerId || '',
          viewerCount: session.viewers.size,
          youControl,
          remoteControlActive: !!session.controllerId,
        }));
        return;
      }

      if (url.pathname === '/__mobile/control/request' && req.method === 'POST') {
        if (!session.info.capabilities?.remoteInput) {
          res.writeHead(403, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ message: 'This device is view-only.' }));
          return;
        }
        if (session.controllerId && session.controllerId !== vid) {
          res.writeHead(409, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ message: 'Another viewer has control. Ask them to release, or revoke from desktop.' }));
          return;
        }
        session.controllerId = vid;
        session.viewers.add(vid);
        session.onState?.('control', { controllerId: vid });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, message: 'You have control.' }));
        return;
      }

      if (url.pathname === '/__mobile/control/release' && req.method === 'POST') {
        if (session.controllerId === vid) {
          session.controllerId = '';
          session.onState?.('control', { controllerId: '' });
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
        return;
      }

      if (url.pathname === '/__mobile/control/revoke' && req.method === 'POST') {
        // Desktop-only path uses loopback without cookie privilege; always allow from agent host.
        session.controllerId = '';
        session.onState?.('control', { controllerId: '' });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
        return;
      }

      if (url.pathname === '/__mobile/input' && req.method === 'POST') {
        if (session.controllerId !== vid) {
          res.writeHead(403, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ message: 'You do not have control.' }));
          return;
        }
        const now = Date.now();
        if (session.lastInputAt && now - session.lastInputAt < 16) {
          res.writeHead(429, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ message: 'Slow down.' }));
          return;
        }
        session.lastInputAt = now;
        const body = await readJson(req);
        const result = await sendAllowlistedInput(session.adbPath, session.serial, session.info, body);
        if (!result.ok) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ message: result.message || result.stderr || 'Input failed.' }));
          return;
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
        return;
      }

      if (url.pathname === '/__mobile/screenshot' && req.method === 'POST') {
        const body = await readJson(req).catch(() => ({}));
        const png = await capturePng(session.adbPath, session.serial);
        if (!png) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ message: 'Could not capture screenshot.' }));
          return;
        }
        // Hand off to gateway /__kexoz via browser same-origin once tunneled.
        const dataUrl = `data:image/png;base64,${png.toString('base64')}`;
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          ok: true,
          dataUrl,
          width: session.info.width,
          height: session.info.height,
          body: body.body || '',
          hint: 'Upload via POST /__kexoz/attachments then /__kexoz/feedback on this host when preview APIs are enabled.',
        }));
        return;
      }

      if (url.pathname === '/__mobile/stream.mjpeg') {
        res.writeHead(200, {
          'Content-Type': 'multipart/x-mixed-replace; boundary=kexozframe',
          'Cache-Control': 'no-store, no-cache, must-revalidate',
          Connection: 'close',
        });
        let stopped = false;
        req.on('close', () => { stopped = true; });
        session.viewers.add(vid);
        const tick = async () => {
          while (!stopped) {
            const png = await capturePng(session.adbPath, session.serial);
            if (stopped) break;
            if (png) {
              res.write(`--kexozframe\r\nContent-Type: image/png\r\nContent-Length: ${png.length}\r\n\r\n`);
              res.write(png);
              res.write('\r\n');
            }
            await new Promise((r) => setTimeout(r, session.frameIntervalMs));
          }
          try { res.end(); } catch { /* ignore */ }
        };
        void tick();
        return;
      }

      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ message: 'not found' }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ message: String(err && err.message || err) }));
    }
  });

  return new Promise((resolve, reject) => {
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      resolve({ server, port: addr.port });
    });
    server.on('error', reject);
  });
}

async function diagnoseMobile() {
  const rows = [];
  const adbInfo = await resolveAdb();
  rows.push({
    id: 'adb',
    ok: !!adbInfo,
    detail: adbInfo ? adbInfo.version : 'ADB not found. Install Android platform-tools or set KEXOZ_ADB_PATH.',
  });
  if (adbInfo) {
    const list = await adb(adbInfo.path, ['devices', '-l']);
    const devices = parseDevices(list.stdout);
    rows.push({
      id: 'devices',
      ok: devices.some((d) => d.state === 'device'),
      detail: devices.length
        ? devices.map((d) => `${d.serial} (${d.state})`).join(', ')
        : 'No devices. Start an emulator or enable USB debugging.',
    });
    const scrcpy = await run(process.platform === 'win32' ? 'where' : 'which', ['scrcpy'], { timeout: 3000 });
    rows.push({
      id: 'scrcpy',
      ok: scrcpy.ok,
      detail: scrcpy.ok ? 'scrcpy found on PATH (preferred encoder)' : 'scrcpy optional; using ADB screencap fallback',
    });
  }
  return { rows, adbPath: adbInfo?.path || '' };
}

function registerMobileHandlers(sendToWindow) {
  ipcMain.handle('kexoz:adb-diagnose', async () => diagnoseMobile());

  ipcMain.handle('kexoz:adb-list-devices', async () => {
    const adbInfo = await resolveAdb();
    if (!adbInfo) return { devices: [], error: 'ADB not found. Set KEXOZ_ADB_PATH or install platform-tools.' };
    const list = await adb(adbInfo.path, ['devices', '-l']);
    if (!list.ok) return { devices: [], error: list.stderr || list.error || 'adb devices failed' };
    const devices = parseDevices(list.stdout);
    for (const device of devices) {
      if (device.state !== 'device') continue;
      try {
        const props = await deviceProps(adbInfo.path, device.serial);
        Object.assign(device, props);
        if (props.model) device.model = props.model;
      } catch { /* ignore */ }
    }
    return { devices, adbPath: adbInfo.path, adbVersion: adbInfo.version };
  });

  ipcMain.handle('kexoz:mobile-preview-start', async (_event, payload) => {
    const serial = String(payload?.serial || '').trim();
    if (!serial) return { ok: false, message: 'Select a device.' };
    const adbInfo = await resolveAdb();
    if (!adbInfo) return { ok: false, message: 'ADB not found.' };
    const state = await adb(adbInfo.path, ['-s', serial, 'get-state']);
    if (!state.ok || !/device/.test(state.stdout)) {
      return { ok: false, message: 'Device is not ready. Authorize USB debugging or start the emulator.' };
    }
    const props = await deviceProps(adbInfo.path, serial);
    const info = {
      serial,
      platform: 'android',
      model: props.model || serial,
      androidVersion: props.androidVersion,
      apiLevel: props.apiLevel,
      manufacturer: props.manufacturer,
      width: props.width,
      height: props.height,
      capabilities: { screen: true, remoteInput: true, keyboard: true, rotation: true, viewOnly: false },
    };
    const sessionId = `m_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    const session = {
      id: sessionId,
      serial,
      adbPath: adbInfo.path,
      info,
      controllerId: '',
      viewers: new Set(),
      frameIntervalMs: Math.max(120, Number(payload?.frameIntervalMs) || 250),
      lastInputAt: 0,
      onState: (kind, data) => sendToWindow?.('kexoz:mobile-state', sessionId, kind, data),
    };
    const { server, port } = await startLocalServer(session);
    session.server = server;
    session.port = port;
    sessions.set(sessionId, session);
    sendToWindow?.('kexoz:mobile-state', sessionId, 'active', { serial, port, remoteControlActive: false });
    return { ok: true, sessionId, port, info };
  });

  ipcMain.handle('kexoz:mobile-preview-stop', async (_event, sessionId) => {
    const session = sessions.get(sessionId);
    if (!session) return { ok: true };
    try { session.server?.close(); } catch { /* ignore */ }
    sessions.delete(sessionId);
    sendToWindow?.('kexoz:mobile-state', sessionId, 'stopped', {});
    return { ok: true };
  });

  ipcMain.handle('kexoz:mobile-preview-revoke', async (_event, sessionId) => {
    const session = sessions.get(sessionId);
    if (!session) return { ok: false, message: 'No session.' };
    session.controllerId = '';
    sendToWindow?.('kexoz:mobile-state', sessionId, 'control', { controllerId: '' });
    return { ok: true };
  });

  ipcMain.handle('kexoz:mobile-sessions', async () => [...sessions.values()].map((s) => ({
    id: s.id,
    serial: s.serial,
    port: s.port,
    info: s.info,
    controllerId: s.controllerId,
    viewerCount: s.viewers.size,
    remoteControlActive: !!s.controllerId,
  })));
}

/** Restart helper used by renderer when re-starting an Android share. */
function getMobileSession(sessionId) {
  return sessions.get(sessionId) || null;
}

function stopAllMobileSessions() {
  for (const [id, session] of sessions) {
    try { session.server?.close(); } catch { /* ignore */ }
    sessions.delete(id);
  }
}

module.exports = {
  registerMobileHandlers,
  stopAllMobileSessions,
  resolveAdb,
  parseDevices,
  getMobileSession,
};
