const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { WebSocketServer, createWebSocketStream } = require('ws');
const { Client } = require('yamux-js');
const { connectTunnel, agentUrl } = require('./tunnel');

const listen = (name) => new Promise((resolve) => {
  const server = http.createServer((req, res) => res.end(`${name} ${req.url}`));
  server.listen(0, '127.0.0.1', () => resolve(server));
});

/** A gateway stand-in: accepts the agent and opens streams to it. */
async function fakeGateway() {
  const gateway = new WebSocketServer({ port: 0 });
  await new Promise((resolve) => gateway.once('listening', resolve));
  const connected = new Promise((resolve) => {
    gateway.on('connection', (socket, request) => {
      const duplex = createWebSocketStream(socket);
      const client = new Client({ enableKeepAlive: false });
      duplex.pipe(client).pipe(duplex);
      resolve({ client, url: request.url });
    });
  });
  return { gateway, connected };
}

function fetchOver(client, port, path) {
  return new Promise((resolve, reject) => {
    const stream = client.open();
    let text = '';
    stream.on('data', (chunk) => { text += chunk.toString(); });
    stream.on('end', () => resolve(text.split('\r\n\r\n').pop()));
    stream.on('close', () => resolve(text.split('\r\n\r\n').pop()));
    stream.on('error', reject);
    // The header and request arrive in one chunk, as they often do in practice.
    stream.write(Buffer.concat([
      Buffer.from([port >> 8, port & 0xff]),
      Buffer.from(`GET ${path} HTTP/1.1\r\nHost: shop.example.test\r\nConnection: close\r\n\r\n`),
    ]));
  });
}

test('agentUrl asks for routed streams and the large window', () => {
  const url = new URL(agentUrl('wss://api.example.test/tunnel/connect?clientId=c&proto=3'));
  assert.equal(url.searchParams.get('routes'), '1');
  assert.equal(url.searchParams.get('window'), '2m');
  assert.equal(url.searchParams.get('proto'), '3');
});

test('each stream goes to the port in its header, 0 meaning the share port', async () => {
  const frontend = await listen('frontend');
  const backend = await listen('backend');
  const { gateway, connected } = await fakeGateway();
  const tunnel = connectTunnel({
    tunnelUrl: `ws://127.0.0.1:${gateway.address().port}/tunnel/connect?proto=3`,
    tunnelType: 'http',
    port: frontend.address().port,
    onLogEntry: null,
    onStateChange: () => {},
  });
  try {
    const { client, url } = await connected;
    assert.match(url, /routes=1/);
    assert.equal(await fetchOver(client, 0, '/'), 'frontend /');
    assert.equal(await fetchOver(client, backend.address().port, '/api/orders'), 'backend /api/orders');
    assert.equal(await fetchOver(client, 0, '/about'), 'frontend /about');
    client.close();
  } finally {
    tunnel.close();
    gateway.close();
    frontend.close();
    backend.close();
  }
});
