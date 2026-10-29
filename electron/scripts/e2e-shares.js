// End-to-end check of port shares and project path routing: the real API and
// gateway and the desktop agent (tunnel.js), driven like the desktop app.
//
// Needs a running server (with Postgres) whose KEXOZ_ROOT_DOMAIN matches
// KEXOZ_E2E_ROOT, e.g.:
//   KEXOZ_E2E_API=http://127.0.0.1:19080 KEXOZ_E2E_ROOT=kexoz.test npm run e2e
const crypto = require('node:crypto');
const http = require('node:http');

const { connectTunnel } = require(process.env.TUNNEL_MODULE || '../src/tunnel.js');

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
  let v = await api('POST', '/client/tunnels', { clientId, subdomain: `e2e-pty-${rand()}`, port: 7681, pathRoutes: [], tunnelType: 'pty', password: 's3cret-pass' });
  check('terminal shares are no longer accepted', v.status === 400, `${v.status} ${JSON.stringify(v.data)}`);
  v = await api('POST', '/client/tunnels', { clientId, subdomain: `e2e-dir-${rand()}`, port: 1, pathRoutes: [], tunnelType: 'folder' });
  check('folder shares are no longer accepted', v.status === 400, `${v.status} ${JSON.stringify(v.data)}`);
  v = await api('POST', '/client/tunnels', { clientId, subdomain: `e2e-tcp-${rand()}`, port: 5432, pathRoutes: [], tunnelType: 'tcp', access: 'private', password: 'x' });
  check('private raw TCP is refused', v.status === 400, `${v.status} ${JSON.stringify(v.data)}`);
  v = await api('POST', '/client/tunnels', { clientId, subdomain: `e2e-tcp-${rand()}`, port: 5432, pathRoutes: [], tunnelType: 'tcp', access: 'public', permissions: 'read' });
  check('read-only raw TCP is refused', v.status === 400, `${v.status} ${JSON.stringify(v.data)}`);
  await api('DELETE', `/client/tunnels/${web.id}`, null, `?clientId=${clientId}`);

  // ---------- Project with path routing ----------
  // A deleted share keeps its address, and the free plan has one.
  authId = '';
  const owner = (await api('POST', '/client/identity', {})).data.id;
  authId = owner;
  return routedProjectSection(owner);
}

function namedServer(name) {
  const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end(`${name}:${req.method}:${req.url}`);
  });
  return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(server)));
}

async function routedProjectSection(clientId) {
  const project = await api('POST', '/client/projects', { clientId, name: `Shop ${rand()}`, tunnelIds: [] });
  check('create a project first', project.status === 201 && !!project.data.projectId, JSON.stringify(project.data));

  const frontend = await namedServer('frontend');
  const backend = await namedServer('backend');
  const sub = `e2e-shop-${rand()}`;
  const host = `${sub}.${ROOT}`;
  const created = await api('POST', '/client/tunnels', {
    clientId, subdomain: sub, port: frontend.address().port, tunnelType: 'http', access: 'public', name: 'Shop',
    pathRoutes: [{ path: '/api', port: backend.address().port }], projectId: project.data.projectId,
  });
  const share = created.data;
  check('create a routed share inside the project', created.status === 201 && share.pathRoutes?.length === 2, JSON.stringify(share));

  const projects = await api('GET', '/client/projects', null, `?clientId=${clientId}`);
  const saved = projects.data.projects?.find(p => p.id === project.data.projectId);
  check('the share belongs to the project', !!saved && saved.tunnelIds.includes(share.id), JSON.stringify(projects.data));

  await api('PUT', `/client/tunnels/${share.id}`, { clientId, ...share, active: true }, `?clientId=${clientId}`);
  const conn = await connect(clientId, share.id, 'http', frontend.address().port);
  check('agent connects for the routed share', conn.connected);

  let r = await request({ host, pathName: '/' });
  check('/ goes to the frontend port', r.status === 200 && r.body.toString() === 'frontend:GET:/', `${r.status} ${r.body}`);
  r = await request({ host, pathName: '/api/orders?page=2' });
  check('/api goes to the backend port, path unchanged', r.status === 200 && r.body.toString() === 'backend:GET:/api/orders?page=2', `${r.status} ${r.body}`);
  r = await request({ host, pathName: '/apidocs' });
  check('/apidocs is not mistaken for /api', r.status === 200 && r.body.toString() === 'frontend:GET:/apidocs', `${r.status} ${r.body}`);
  r = await request({ method: 'POST', host, pathName: '/api/orders', body: '{}', headers: { 'Content-Type': 'application/json' } });
  check('POST /api reaches the backend', r.status === 200 && r.body.toString() === 'backend:POST:/api/orders', `${r.status} ${r.body}`);

  conn.tunnel.close();
  frontend.close();
  backend.close();
  await api('DELETE', `/client/tunnels/${share.id}`, null, `?clientId=${clientId}`);
  await api('DELETE', `/client/projects/${project.data.projectId}`, null, `?clientId=${clientId}`);

  const failed = results.filter(x => !x.ok);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  process.exit(failed.length ? 1 : 0);
}

main().catch(err => { console.error(err); process.exit(1); });

