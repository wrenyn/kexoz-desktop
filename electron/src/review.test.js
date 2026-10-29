const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { portForRequest, startRouteProxy } = require('./review');

const listen = (name) => new Promise((resolve) => {
  const server = http.createServer((req, res) => res.end(`${name} ${req.headers.host.split(':')[0]} ${req.url}`));
  server.listen(0, '127.0.0.1', () => resolve(server));
});

test('picks the longest matching path prefix', () => {
  const routes = [{ path: '/api', port: 2 }, { path: '/api/v2', port: 3 }];
  assert.equal(portForRequest(routes, 1, '/'), 1);
  assert.equal(portForRequest(routes, 1, '/api'), 2);
  assert.equal(portForRequest(routes, 1, '/api/users?x=1'), 2);
  assert.equal(portForRequest(routes, 1, '/api/v2/users'), 3);
  assert.equal(portForRequest(routes, 1, '/apix'), 1);
});

test('capture proxy sends each path to its port', async () => {
  const web = await listen('web');
  const api = await listen('api');
  const proxy = await startRouteProxy(web.address().port, [{ path: '/api', port: api.address().port }]);
  try {
    const base = `http://127.0.0.1:${proxy.address().port}`;
    assert.equal(await (await fetch(`${base}/pricing`)).text(), 'web localhost /pricing');
    assert.equal(await (await fetch(`${base}/api/status`)).text(), 'api localhost /api/status');
  } finally {
    proxy.stop();
    web.close();
    api.close();
  }
});
