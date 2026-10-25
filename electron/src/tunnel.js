const WebSocket = require('ws');
const { createWebSocketStream } = require('ws');
const { Server } = require('yamux-js');
const net = require('node:net');

// The server pings every 54s; two missed pings means the link is dead even if
// the socket never reported an error (sleep, Wi-Fi switch, NAT timeout).
const SILENCE_LIMIT_MS = 120_000;
const RETRY_BASE_MS = 1_000;
const RETRY_MAX_MS = 15_000;

function parseHead(text) {
  const lines = text.split('\r\n');
  const headers = {};
  let body = '';
  for (let i = 1; i < lines.length; i++) {
    if (lines[i] === '') {
      body = lines.slice(i + 1).join('\r\n');
      break;
    }
    const [k, ...v] = lines[i].split(':');
    if (k && v.length) headers[k.trim().toLowerCase()] = v.join(':').trim();
  }
  return { firstLine: lines[0], headers, body };
}

function pipeUdp(stream, port) {
  const dgram = require('node:dgram');
  const localSocket = dgram.createSocket('udp4');
  let headerBuffer = Buffer.alloc(0);
  stream.on('data', (data) => {
    headerBuffer = Buffer.concat([headerBuffer, data]);
    while (headerBuffer.length >= 2) {
      const len = headerBuffer.readUInt16BE(0);
      if (headerBuffer.length < 2 + len) break;
      const packet = headerBuffer.slice(2, 2 + len);
      headerBuffer = headerBuffer.slice(2 + len);
      localSocket.send(packet, port, '127.0.0.1');
    }
  });
  localSocket.on('message', (msg) => {
    const frame = Buffer.alloc(2 + msg.length);
    frame.writeUInt16BE(msg.length, 0);
    msg.copy(frame, 2);
    stream.write(frame);
  });
  stream.on('close', () => localSocket.close());
  localSocket.on('close', () => stream.close());
  localSocket.on('error', () => stream.close());
  stream.on('error', () => localSocket.close());
}

function pipeTcp(stream, port, onLogEntry) {
  const localSocket = net.connect(port, '127.0.0.1');
  let reqLogId = null;
  let reqStartTime = null;
  let firstReqChunk = true;
  let firstRespChunk = true;

  stream.on('data', (data) => {
    if (firstReqChunk && onLogEntry) {
      firstReqChunk = false;
      try {
        const text = data.toString('utf8');
        if (/^(GET|POST|PUT|DELETE|OPTIONS|PATCH|HEAD) /.test(text)) {
          const { firstLine, headers, body } = parseHead(text);
          const [method, path] = firstLine.split(' ');
          reqLogId = Math.random().toString(36).substring(2, 11);
          reqStartTime = Date.now();
          onLogEntry({
            id: reqLogId,
            method,
            path,
            status: null,
            timestamp: new Date().toISOString(),
            durationMs: null,
            headers,
            body: body.substring(0, 10000),
          });
        }
      } catch {}
    }
    localSocket.write(data);
  });

  localSocket.on('data', (data) => {
    if (firstRespChunk && reqLogId && onLogEntry) {
      firstRespChunk = false;
      try {
        const text = data.toString('utf8');
        if (text.startsWith('HTTP/')) {
          const { firstLine, headers, body } = parseHead(text);
          const status = parseInt(firstLine.split(' ')[1], 10);
          onLogEntry({
            id: reqLogId,
            status: status || 200,
            durationMs: Date.now() - reqStartTime,
            responseHeaders: headers,
            responseBody: body.substring(0, 10000),
          });
        }
      } catch {}
    }
    stream.write(data);
  });

  stream.on('close', () => localSocket.destroy());
  localSocket.on('close', () => stream.close());
  localSocket.on('error', () => stream.close());
  stream.on('error', () => localSocket.destroy());
}

/**
 * Keeps one share connected to the gateway, reconnecting with backoff until
 * close() is called. Each call owns its own socket, so several shares can run
 * side by side and a replaced connection can't report on its successor.
 */
/** Turns socket errors into something a person can act on. */
function describeDrop(message, code) {
  const text = String(message || '');
  const status = /Unexpected server response: (\d+)/.exec(text);
  if (status) {
    const value = Number(status[1]);
    if (value === 402) return 'Plan limit reached or monthly data used up';
    if (value === 401 || value === 403) return 'The server refused this share';
    if (value === 404) return 'The share no longer exists on the server';
    if (value === 429) return 'Too many connection attempts';
    if (value >= 500) return `Server error (${value})`;
    return `Server answered ${value}`;
  }
  if (/ENOTFOUND|EAI_AGAIN/.test(text)) return 'No internet connection or DNS lookup failed';
  if (/ECONNREFUSED/.test(text)) return 'The server refused the connection';
  if (/ETIMEDOUT|timed out/i.test(text)) return 'Connection timed out';
  if (/ECONNRESET/.test(text)) return 'The connection was reset';
  if (/certificate|CERT_|SSL|TLS/i.test(text)) return 'Secure connection failed (certificate problem)';
  if (text) return text;
  if (code === 1006) return 'Network connection dropped';
  return code ? `Connection closed (code ${code})` : 'Connection closed';
}

function connectTunnel({ tunnelUrl, tunnelType, port, onLogEntry, onStateChange }) {
  let currentPort = port;
  let ws = null;
  let session = null;
  let closed = false;
  let attempt = 0;
  let retryTimer = null;
  let silenceTimer = null;
  let lastError = '';

  const clearSilence = () => {
    if (silenceTimer) clearTimeout(silenceTimer);
    silenceTimer = null;
  };
  const armSilence = (socket) => {
    clearSilence();
    silenceTimer = setTimeout(() => {
      lastError = 'The server stopped responding';
      socket.terminate();
    }, SILENCE_LIMIT_MS);
  };

  const scheduleRetry = () => {
    if (closed || retryTimer) return;
    const delay = Math.min(RETRY_MAX_MS, RETRY_BASE_MS * 2 ** attempt);
    attempt += 1;
    retryTimer = setTimeout(() => {
      retryTimer = null;
      open();
    }, delay);
  };

  const teardown = () => {
    clearSilence();
    if (session) {
      try { session.close(); } catch {}
      session = null;
    }
    if (ws) {
      ws.removeAllListeners();
      ws.on('error', () => {});
      try { ws.terminate(); } catch {}
      ws = null;
    }
  };

  function open() {
    if (closed) return;
    teardown();
    onStateChange('connecting');
    lastError = '';
    const socket = new WebSocket(tunnelUrl);
    ws = socket;

    socket.on('open', () => {
      if (socket !== ws) return;
      attempt = 0;
      armSilence(socket);
      onStateChange('connected');

      const duplex = createWebSocketStream(socket);
      duplex.on('error', () => socket.terminate());
      const yamux = new Server((stream) => {
        if (!currentPort) {
          stream.close();
          return;
        }
        if (tunnelType === 'udp') pipeUdp(stream, currentPort);
        else pipeTcp(stream, currentPort, onLogEntry);
      });
      yamux.on('error', () => socket.terminate());
      session = yamux;
      duplex.pipe(yamux).pipe(duplex);
    });

    socket.on('ping', () => armSilence(socket));
    socket.on('message', () => armSilence(socket));

    socket.on('close', (code, reason) => {
      if (socket !== ws) return;
      teardown();
      if (closed) return;
      onStateChange('disconnected', describeDrop(lastError || (reason && reason.toString()), code));
      scheduleRetry();
    });

    socket.on('error', (err) => {
      lastError = err.message;
      console.error('Tunnel connection error:', err.message);
    });
  }

  open();

  return {
    setPort(next) {
      currentPort = next;
    },
    reconnectNow() {
      if (closed) return;
      if (retryTimer) clearTimeout(retryTimer);
      retryTimer = null;
      attempt = 0;
      open();
    },
    close() {
      closed = true;
      if (retryTimer) clearTimeout(retryTimer);
      retryTimer = null;
      teardown();
    },
  };
}

module.exports = { connectTunnel, describeDrop };
