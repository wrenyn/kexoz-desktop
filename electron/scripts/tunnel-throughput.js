// Measures how fast a large download crosses the tunnel when the link has
// latency. Run with: node scripts/tunnel-throughput.js [megabytes] [rttMs]
const http = require('node:http');
const { WebSocketServer, createWebSocketStream } = require('ws');
const { Client } = require('yamux-js');
const { connectTunnel } = require(process.env.TUNNEL_MODULE || '../src/tunnel');

const megabytes = Number(process.argv[2] || 64);
const rtt = Number(process.argv[3] || 100);
const HOST = 'speed.example.test';

async function main() {
  const payload = Buffer.alloc(megabytes * 1024 * 1024, 7);
  const files = http.createServer((_req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Content-Length': payload.length });
    res.end(payload);
  });
  await new Promise(resolve => files.listen(0, '127.0.0.1', resolve));
  const filePort = files.address().port;

  const gateway = new WebSocketServer({ port: 0 });
  await new Promise(resolve => gateway.once('listening', resolve));
  const later = fn => setTimeout(fn, rtt / 2);

  const session = new Promise(resolve => {
    gateway.on('connection', (socket, request) => {
      const duplex = createWebSocketStream(socket);
      // The gateway's window, like the server's yamux config.
      const large = new URL(request.url, 'ws://gateway').searchParams.get('window') === '2m';
      const client = new Client({ maxStreamWindowSize: large ? 2 * 1024 * 1024 : 256 * 1024, enableKeepAlive: false });
      duplex.on('data', chunk => later(() => client.write(chunk)));
      client.on('data', chunk => later(() => { if (socket.readyState === 1) socket.send(chunk); }));
      resolve(client);
    });
  });

  const tunnel = connectTunnel({
    tunnelUrl: `ws://127.0.0.1:${gateway.address().port}`,
    tunnelType: 'http',
    port: filePort,
    onLogEntry: null,
    onStateChange: () => {},
  });
  const client = await session;
  const stream = client.open();
  const started = Date.now();
  let received = 0;
  const memoryPeak = { rss: 0 };
  const sampler = setInterval(() => { memoryPeak.rss = Math.max(memoryPeak.rss, process.memoryUsage().rss); }, 50);
  await new Promise((resolve, reject) => {
    stream.on('data', chunk => {
      received += chunk.length;
      if (received >= megabytes * 1024 * 1024) resolve();
    });
    stream.on('error', reject);
    // Port header 0: the share's own port.
    stream.write(Buffer.from([0, 0]));
    stream.write(`GET /big.bin HTTP/1.1\r\nHost: ${HOST}\r\nConnection: close\r\n\r\n`);
  });
  clearInterval(sampler);
  const seconds = (Date.now() - started) / 1000;
  console.log(`${process.env.TUNNEL_MODULE ? 'before' : 'after'}: ${megabytes} MB at ${rtt} ms RTT: ${seconds.toFixed(1)} s, ${(megabytes / seconds).toFixed(1)} MB/s, peak memory ${(memoryPeak.rss / 1024 / 1024).toFixed(0)} MB`);

  tunnel.close();
  client.close();
  gateway.close();
  files.close();
  process.exit(0);
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
