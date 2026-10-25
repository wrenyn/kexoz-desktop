// End-to-end check of port and folder shares: the real API and gateway, the
// desktop agent (tunnel.js) and the folder server, driven like the desktop app.
//
// Needs a running server (with Postgres) whose KEXOZ_ROOT_DOMAIN matches
// KEXOZ_E2E_ROOT, e.g.:
//   KEXOZ_E2E_API=http://127.0.0.1:19080 KEXOZ_E2E_ROOT=kexoz.test npm run e2e
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { connectTunnel } = require('../src/tunnel.js');
const { createFolderServer } = require('../src/fileServer.js');

const API = process.env.KEXOZ_E2E_API || 'http://127.0.0.1:9080';
const ROOT = process.env.KEXOZ_E2E_ROOT || 'kexoz.test';
const AGENT_URL = API.replace(/^http/, 'ws');
const results = [];

function check(name, ok, detail = '') {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  -> ${detail}`}`);
}

function request({ method = 'GET', host, pathName = '/', headers = {}, body }) {
  return new Promise((resolve, reject) => {
    const req = http.request(`${API}${pathName}`, { method, headers: { Host: host, ...headers } }, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

let authId = '';
async function api(method, pathName, body, query = '') {
  const res = await fetch(`${API}${pathName}${query}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(authId ? { 'X-Kexoz-Client-ID': authId } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, data };
}

const sleep = ms => new Promise(r => setTimeout(r, ms));
const rand = () => Math.random().toString(36).slice(2, 7);

async function connect(clientId, tunnelId, tunnelType, port) {
  let state = '';
  const tunnel = connectTunnel({
    tunnelUrl: `${AGENT_URL}/tunnel/connect?clientId=${clientId}&tunnelId=${tunnelId}&proto=3`,
    tunnelType,
    port,
    onLogEntry: () => {},
    onStateChange: s => { state = s; },
  });
  for (let i = 0; i < 50 && state !== 'connected'; i++) await sleep(100);
  await sleep(300);
  return { tunnel, connected: state === 'connected' };
}

async function main() {
  const identity = await api('POST', '/client/identity', {});
  const clientId = identity.data.id;
  authId = clientId;
  check('client identity issued', identity.status < 300 && !!clientId, JSON.stringify(identity));

  // ---------- Port share ----------
  const local = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end(`local:${req.method}:${req.url}`);
  });
  await new Promise(r => local.listen(0, '127.0.0.1', r));
  const localPort = local.address().port;
  const webSub = `e2e-web-${rand()}`;
  const webHost = `${webSub}.${ROOT}`;

  const created = await api('POST', '/client/tunnels', {
    clientId, subdomain: webSub, customDomain: '', port: localPort, requireAuth: false,
    pathRoutes: [{ path: '/', port: localPort }], tunnelType: 'http', access: 'public', permissions: 'read-write', duration: '1h',
  });
  const web = created.data;
  check('create public web share', created.status === 201 || created.status === 200, JSON.stringify(created));
  check('web share reports access=public', web.access === 'public', web.access);
  check('web share reports permissions=read-write', web.permissions === 'read-write', web.permissions);
  check('1h expiry sets expiresAt', !!web.expiresAt && new Date(web.expiresAt) - Date.now() > 55 * 60e3, web.expiresAt);

  const started = await api('PUT', `/client/tunnels/${web.id}`, { clientId, ...web, active: true }, `?clientId=${clientId}`);
  check('start share (desktop-style PUT with whole record)', started.status === 200 && started.data.active === true, JSON.stringify(started.data));
  check('started share status=active', started.data.status === 'active', started.data.status);

  const webConn = await connect(clientId, web.id, 'http', localPort);
  check('agent connects for web share', webConn.connected);

  let r = await request({ host: webHost, pathName: '/hello?x=1' });
  check('visitor GET reaches local app', r.status === 200 && r.body.toString() === 'local:GET:/hello?x=1', `${r.status} ${r.body}`);
  r = await request({ method: 'POST', host: webHost, pathName: '/form', body: 'a=1', headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
  check('read-write share allows POST', r.status === 200 && r.body.toString() === 'local:POST:/form', `${r.status} ${r.body}`);

  const ro = await api('PUT', `/client/tunnels/${web.id}`, { clientId, ...started.data, permissions: 'read' }, `?clientId=${clientId}`);
  check('switch share to read-only', ro.status === 200 && ro.data.permissions === 'read', JSON.stringify(ro.data));
  r = await request({ method: 'POST', host: webHost, pathName: '/form', body: 'a=1' });
  check('read-only share blocks POST with 405', r.status === 405, `${r.status} ${r.body}`);
  r = await request({ host: webHost, pathName: '/still-ok' });
  check('read-only share still serves GET', r.status === 200, `${r.status}`);

  let p = await api('POST', `/client/tunnels/${web.id}/pause`, { clientId });
  check('pause share', p.status === 200 && p.data.paused === true && p.data.status === 'paused', JSON.stringify(p.data));
  r = await request({ host: webHost });
  check('paused share refuses visitors with 503', r.status === 503, `${r.status} ${r.body}`);
  r = await request({ host: webHost, headers: { Accept: 'text/html' } });
  check('paused share shows a "paused" page to browsers', r.status === 503 && r.body.toString().includes('This share is paused'), `${r.status}`);
  p = await api('POST', `/client/tunnels/${web.id}/resume`, { clientId });
  check('resume share', p.status === 200 && p.data.paused === false && p.data.status === 'active', JSON.stringify(p.data));
  r = await request({ host: webHost });
  check('resumed share serves visitors again', r.status === 200, `${r.status}`);

  const priv = await api('PUT', `/client/tunnels/${web.id}`, { clientId, ...p.data, access: 'private' }, `?clientId=${clientId}`);
  check('a share cannot be made private without a password', priv.status === 400, `${priv.status} ${JSON.stringify(priv.data)}`);
  const withPw = await api('PUT', `/client/tunnels/${web.id}`, { clientId, ...p.data, password: 's3cret-pass', access: 'private' }, `?clientId=${clientId}`);
  check('password makes the share private', withPw.status === 200 && withPw.data.access === 'private', `${withPw.status} ${JSON.stringify(withPw.data)}`);
  r = await request({ host: webHost });
  check('private share without credentials gets 401', r.status === 401, `${r.status}`);
  r = await request({ host: webHost, headers: { Authorization: 'Basic ' + Buffer.from('kexoz:s3cret-pass').toString('base64') } });
  check('private share with password gets through', r.status === 200, `${r.status}`);
  const pub = await api('PUT', `/client/tunnels/${web.id}`, { clientId, ...withPw.data, access: 'public' }, `?clientId=${clientId}`);
  check('switch back to public clears the password', pub.status === 200 && pub.data.access === 'public' && !pub.data.password, JSON.stringify(pub.data));
  r = await request({ host: webHost });
  check('public again: no credentials needed', r.status === 200, `${r.status}`);

  webConn.tunnel.close();
  local.close();

  // ---------- Validation rules ----------
  let v = await api('POST', '/client/tunnels', { clientId, subdomain: `e2e-pty-${rand()}`, port: 7681, pathRoutes: [], tunnelType: 'pty', access: 'public' });
  check('public terminal is refused', v.status === 400, `${v.status} ${JSON.stringify(v.data)}`);
  v = await api('POST', '/client/tunnels', { clientId, subdomain: `e2e-tcp-${rand()}`, port: 5432, pathRoutes: [], tunnelType: 'tcp', access: 'private', password: 'x' });
  check('private raw TCP is refused', v.status === 400, `${v.status} ${JSON.stringify(v.data)}`);
  v = await api('POST', '/client/tunnels', { clientId, subdomain: `e2e-tcp-${rand()}`, port: 5432, pathRoutes: [], tunnelType: 'tcp', access: 'public', permissions: 'read' });
  check('read-only raw TCP is refused', v.status === 400, `${v.status} ${JSON.stringify(v.data)}`);
  // ---------- Folder share ----------
  await api('DELETE', `/client/tunnels/${web.id}`, null, `?clientId=${clientId}`);
  authId = '';
  const owner = (await api('POST', '/client/identity', {})).data.id;
  authId = owner;
  return folderSection(owner);
}

async function folderSection(clientId) {
  let r, p;
  const v = await api('POST', '/client/tunnels', { clientId, subdomain: `e2e-def-${rand()}`, port: 3000, pathRoutes: [{ path: '/', port: 3000 }], tunnelType: 'http', password: 'pass1' });
  check('share with a password and no access defaults to private', v.status < 300 && v.data.access === 'private', `${v.status} ${JSON.stringify(v.data)}`);
  if (v.data?.id) await api('DELETE', `/client/tunnels/${v.data.id}`, null, `?clientId=${clientId}`);
  // A deleted share keeps its address, and the free plan has one.
  authId = '';
  clientId = (await api('POST', '/client/identity', {})).data.id;
  authId = clientId;

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kexoz-folder-'));
  fs.writeFileSync(path.join(dir, 'readme.txt'), 'hello from the shared folder');
  fs.writeFileSync(path.join(dir, '.env'), 'SECRET=1');
  fs.writeFileSync(path.join(dir, 'id_rsa'), 'PRIVATE KEY');
  fs.mkdirSync(path.join(dir, 'node_modules'));
  fs.writeFileSync(path.join(dir, 'node_modules', 'x.js'), 'x');
  fs.mkdirSync(path.join(dir, 'docs', 'private'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'docs', 'guide.md'), '# guide');
  fs.writeFileSync(path.join(dir, 'docs', 'private', 'plan.txt'), 'hidden plan');
  fs.writeFileSync(path.join(dir, 'big.bin'), Buffer.alloc(200000, 7));

  const folderSub = `e2e-folder-${rand()}`;
  const folderHost = `${folderSub}.${ROOT}`;
  const fc = await api('POST', '/client/tunnels', {
    clientId, subdomain: folderSub, customDomain: '', port: 1, requireAuth: false, pathRoutes: [{ path: '/', port: 1 }], tunnelType: 'folder', access: 'public',
  });
  let folderShare = fc.data;
  check('create folder share', fc.status < 300 && folderShare.tunnelType === 'folder', `${fc.status} ${JSON.stringify(fc.data)}`);
  check('folder share defaults to read-only', folderShare.permissions === 'read', folderShare.permissions);

  const fs1 = await api('PUT', `/client/tunnels/${folderShare.id}`, { clientId, ...folderShare, active: true }, `?clientId=${clientId}`);
  folderShare = fs1.data;
  check('start folder share', fs1.status === 200 && folderShare.active, JSON.stringify(fs1.data));

  let server = createFolderServer({ root: dir, readOnly: true, excludes: ['.git', 'node_modules', 'docs/private/'], hosts: [folderHost] });
  let folderPort = await server.listen();
  let folderConn = await connect(clientId, folderShare.id, 'folder', folderPort);
  check('agent connects for folder share', folderConn.connected);

  r = await request({ host: folderHost, headers: { Accept: 'text/html' } });
  const listing = r.body.toString();
  check('folder listing served through the gateway', r.status === 200 && listing.includes('readme.txt') && listing.includes('docs'), `${r.status} ${listing.slice(0, 200)}`);
  check('listing hides .env, private keys and node_modules', !listing.includes('.env') && !listing.includes('id_rsa') && !listing.includes('node_modules'), listing.slice(0, 400));
  r = await request({ host: folderHost, pathName: '/readme.txt' });
  check('file download works', r.status === 200 && r.body.toString() === 'hello from the shared folder', `${r.status} ${r.body}`);
  r = await request({ host: folderHost, pathName: '/docs/', headers: { Accept: 'text/html' } });
  check('subfolder listing hides the locked folder', r.status === 200 && r.body.toString().includes('guide.md') && !r.body.toString().includes('plan.txt') && !/>private</.test(r.body.toString()), `${r.status}`);
  for (const blocked of ['/.env', '/id_rsa', '/node_modules/x.js', '/docs/private/plan.txt', '/%2e%2e/%2e%2e/Windows/win.ini', '/..%2f..%2fWindows/win.ini']) {
    r = await request({ host: folderHost, pathName: blocked });
    check(`blocked: ${blocked}`, r.status >= 400 && r.status < 500, `${r.status} ${r.body.toString().slice(0, 80)}`);
  }
  r = await request({ host: folderHost, pathName: '/big.bin', headers: { Range: 'bytes=100-199' } });
  check('resumable download (Range -> 206, 100 bytes)', r.status === 206 && r.body.length === 100, `${r.status} ${r.body.length}`);
  r = await request({ host: folderHost, pathName: '/?zip' });
  check('zip download', r.status === 200 && r.body.slice(0, 2).toString() === 'PK' && r.body.includes(Buffer.from('readme.txt')) && !r.body.includes(Buffer.from('.env')) && !r.body.includes(Buffer.from('plan.txt')), `${r.status} ${r.headers['content-type']}`);
  r = await request({ method: 'PUT', host: folderHost, pathName: '/upload.txt', body: 'nope' });
  check('read-only folder: upload blocked at the gateway (405)', r.status === 405, `${r.status}`);
  check('nothing written to disk', !fs.existsSync(path.join(dir, 'upload.txt')));
  r = await request({ method: 'POST', host: folderHost, pathName: '/', headers: { Accept: 'text/html' }, body: 'x=1' });
  check('read-only folder: browsers get a page, not JSON', r.status === 405 && r.body.toString().includes('view only'), `${r.status} ${r.body.toString().slice(0, 80)}`);

  const fp = await api('PUT', `/client/tunnels/${folderShare.id}`, { clientId, ...folderShare, access: 'private', password: 'folder-pass' }, `?clientId=${clientId}`);
  folderShare = fp.data;
  check('make folder share private', fp.status === 200 && folderShare.access === 'private', `${fp.status} ${JSON.stringify(fp.data)}`);
  r = await request({ host: folderHost, pathName: '/docs/', headers: { Accept: 'text/html' } });
  check('private folder: visitors see the password page', r.status === 401 && r.body.toString().includes('kexoz_share_password'), `${r.status}`);
  const unlockForm = password => ({ method: 'POST', host: folderHost, pathName: '/docs/', body: `kexoz_share_password=${password}`, headers: { Accept: 'text/html', 'Content-Type': 'application/x-www-form-urlencoded' } });
  r = await request(unlockForm('wrong'));
  check('private folder: wrong password is refused', r.status === 401, `${r.status}`);
  r = await request(unlockForm('folder-pass'));
  const cookie = String(r.headers['set-cookie'] || '').split(';')[0];
  check('private folder: right password goes back to the page', r.status === 303 && r.headers.location === '/docs/' && cookie.startsWith('ps_share='), `${r.status} ${r.headers.location}`);
  r = await request({ host: folderHost, pathName: '/docs/', headers: { Accept: 'text/html', Cookie: cookie } });
  check('private folder: listing opens after unlocking', r.status === 200 && r.body.toString().includes('guide.md'), `${r.status}`);
  r = await request({ ...unlockForm('folder-pass'), headers: { ...unlockForm('').headers, Cookie: cookie } });
  check('private folder: password form sent again (back button) returns to the folder', r.status === 303 && r.headers.location === '/docs/', `${r.status} ${r.body.toString().slice(0, 80)}`);

  const fpub = await api('PUT', `/client/tunnels/${folderShare.id}`, { clientId, ...folderShare, access: 'public' }, `?clientId=${clientId}`);
  folderShare = fpub.data;
  check('make folder share public again', fpub.status === 200 && folderShare.access === 'public', `${fpub.status}`);
  r = await request(unlockForm('folder-pass'));
  check('public folder: a password page left open still lands on the folder', r.status === 303 && r.headers.location === '/docs/', `${r.status} ${r.body.toString().slice(0, 80)}`);
  r = await request({ host: folderHost, pathName: '/docs/', headers: { Accept: 'text/html' } });
  check('public folder: listing opens without a password', r.status === 200 && r.body.toString().includes('guide.md'), `${r.status}`);

  const fw = await api('PUT', `/client/tunnels/${folderShare.id}`, { clientId, ...folderShare, permissions: 'read-write' }, `?clientId=${clientId}`);
  folderShare = fw.data;
  check('switch folder share to read & write', fw.status === 200 && folderShare.permissions === 'read-write', JSON.stringify(fw.data));
  folderConn.tunnel.close();
  server.close();
  server = createFolderServer({ root: dir, readOnly: false, excludes: ['.git', 'node_modules', 'docs/private/'], hosts: [folderHost] });
  folderPort = await server.listen();
  folderConn = await connect(clientId, folderShare.id, 'folder', folderPort);

  r = await request({ method: 'PUT', host: folderHost, pathName: '/uploads/new.txt', body: 'orphan' });
  check('read & write folder: upload into a missing folder is refused', r.status === 404 && !fs.existsSync(path.join(dir, 'uploads')), `${r.status}`);
  r = await request({ method: 'PUT', host: folderHost, pathName: '/uploads/' });
  check('read & write folder: create folder', r.status === 201 && fs.statSync(path.join(dir, 'uploads')).isDirectory(), `${r.status} ${r.body}`);
  r = await request({ method: 'PUT', host: folderHost, pathName: '/uploads/new.txt', body: 'uploaded!' });
  check('read & write folder: upload works', r.status === 201 && fs.readFileSync(path.join(dir, 'uploads', 'new.txt'), 'utf8') === 'uploaded!', `${r.status} ${r.body}`);
  r = await request({ method: 'PUT', host: folderHost, pathName: '/.env', body: 'OVERWRITE' });
  check('read & write folder: cannot overwrite secrets', r.status >= 400 && fs.readFileSync(path.join(dir, '.env'), 'utf8') === 'SECRET=1', `${r.status}`);
  r = await request({ method: 'DELETE', host: folderHost, pathName: '/uploads/new.txt' });
  check('read & write folder: delete works', r.status < 300 && !fs.existsSync(path.join(dir, 'uploads', 'new.txt')), `${r.status}`);
  r = await request({ method: 'DELETE', host: folderHost, pathName: '/docs' });
  check('read & write folder: refuses to delete a non-empty folder', r.status >= 400 && fs.existsSync(path.join(dir, 'docs', 'guide.md')), `${r.status}`);

  await new Promise(resolve => {
    http.get({ host: '127.0.0.1', port: folderPort, path: '/readme.txt', headers: { Host: 'evil.example' } }, res => {
      check('folder server rejects foreign Host headers (DNS rebinding)', res.statusCode === 421, `${res.statusCode}`);
      res.resume();
      res.on('end', resolve);
    });
  });

  p = await api('POST', `/client/tunnels/${folderShare.id}/pause`, { clientId });
  r = await request({ host: folderHost, pathName: '/readme.txt' });
  check('paused folder share refuses visitors', r.status === 503, `${r.status}`);

  folderConn.tunnel.close();
  server.close();
  r = await request({ host: folderHost, pathName: '/readme.txt' });
  await api('POST', `/client/tunnels/${folderShare.id}/resume`, { clientId });
  r = await request({ host: folderHost, pathName: '/readme.txt' });
  check('stopped folder share reports offline (502)', r.status === 502, `${r.status}`);

  const del = await api('DELETE', `/client/tunnels/${folderShare.id}`, null, `?clientId=${clientId}`);
  check('delete folder share', del.status < 300, `${del.status}`);
  fs.rmSync(dir, { recursive: true, force: true });

  const failed = results.filter(x => !x.ok);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  process.exit(failed.length ? 1 : 0);
}

main().catch(err => { console.error(err); process.exit(1); });
