const WebSocket = require('ws');
const { createWebSocketStream } = require('ws');
const { Server } = require('yamux-js');
const { Stream: YamuxStream } = require('yamux-js/lib/stream');
const { Session: YamuxSession } = require('yamux-js/lib/session');
const { STREAM_STATES, FLAGS, TYPES } = require('yamux-js/lib/constants');
const net = require('node:net');

// How much each side may have in flight per stream. yamux's 256 KB default
// caps one download at about 2.5 MB/s on a 100 ms link. The server only
// grants the larger window to clients that ask for it with window=2m.
const STREAM_WINDOW = 2 * 1024 * 1024;
const WINDOW_PARAM = '2m';

function withLargeWindow(tunnelUrl) {
  const url = new URL(tunnelUrl);
  url.searchParams.set('window', WINDOW_PARAM);
  return url.toString();
}

// yamux-js drops the window a peer grants in the frame that opens a stream,
// so a server offering more than 256 KB would never hear from us again.
if (!YamuxSession.prototype.kexozOpenWindow) {
  const handle = YamuxSession.prototype.handleStreamMessage;
  YamuxSession.prototype.kexozOpenWindow = true;
  YamuxSession.prototype.handleStreamMessage = function (header, packet, encoding) {
    const result = handle.call(this, header, packet, encoding);
    if (header.flags === FLAGS.SYN && header.type === TYPES.WindowUpdate && header.length > 0) {
      const stream = this.streams.get(header.streamID);
      if (stream) stream.sendWindow += header.length;
    }
    return result;
  };
}

// yamux-js re-checks a full send window every 100 ms, so a large download
// stalls each time the window fills. Resume as soon as the peer grants more.
if (!YamuxStream.prototype.kexozWindowWait) {
  const writeChunk = YamuxStream.prototype._write;
  const growWindow = YamuxStream.prototype.incrSendWindow;
  const forceClose = YamuxStream.prototype.forceClose;
  const open = new Set([STREAM_STATES.Init, STREAM_STATES.SYNSent, STREAM_STATES.SYNReceived, STREAM_STATES.Established]);
  const resume = (stream) => {
    const pending = stream.kexozPending;
    if (!pending) return;
    stream.kexozPending = null;
    clearTimeout(pending.timer);
    writeChunk.call(stream, pending.chunk, pending.encoding, pending.cb);
  };
  YamuxStream.prototype.kexozWindowWait = true;
  YamuxStream.prototype._write = function (chunk, encoding, cb) {
    if (this.sendWindow > 0 || !open.has(this.state)) return writeChunk.call(this, chunk, encoding, cb);
    // A slow fallback in case a window update is ever missed.
    this.kexozPending = { chunk, encoding, cb, timer: setTimeout(() => resume(this), 1000) };
  };
  YamuxStream.prototype.incrSendWindow = function (hdr) {
    growWindow.call(this, hdr);
    if (this.sendWindow > 0 || !open.has(this.state)) resume(this);
  };
  YamuxStream.prototype.forceClose = function () {
    forceClose.call(this);
    resume(this);
  };
}

// Forwards one direction, pausing the source while the destination is full
// so a large file isn't read into memory faster than the tunnel can send it.
function forward(source, destination, chunk) {
  if (destination.write(chunk) || source.kexozWaiting) return;
  source.kexozWaiting = true;
  source.pause();
  destination.once('drain', () => {
    source.kexozWaiting = false;
    source.resume();
  });
}

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
    forward(stream, localSocket, data);
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
    forward(localSocket, stream, data);
  });

  // A second FIN is a protocol error that makes the server drop the session.
  let finSent = false;
  const closeStream = () => {
    if (finSent) return;
    finSent = true;
    stream.close();
  };
  stream.on('close', () => localSocket.destroy());
  // The local server may hang up while the tunnel is still sending its last
  // bytes; finish sending before closing or the download is cut short.
  stream.once('finish', closeStream);
  localSocket.on('close', () => {
    if (finSent || stream.destroyed || stream.writableEnded) return closeStream();
    stream.end();
  });
  localSocket.on('error', closeStream);
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
    const socket = new WebSocket(withLargeWindow(tunnelUrl));
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
      }, { maxStreamWindowSize: STREAM_WINDOW });
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
