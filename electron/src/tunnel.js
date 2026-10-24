const WebSocket = require('ws');
const { createWebSocketStream } = require('ws');
const { Server } = require('yamux-js');
const net = require('node:net');

let currentSession = null;
let currentWs = null;

function connectTunnel({ tunnelUrl, tunnelType, getPort, onLogEntry, onStateChange }) {
  if (currentSession) {
    currentSession.close();
  }
  if (currentWs) {
    currentWs.close();
  }

  // binaryType must stay 'nodebuffer': createWebSocketStream pushes frames into a
  // Node stream, which throws on ArrayBuffer chunks.
  const ws = new WebSocket(tunnelUrl);
  currentWs = ws;
  ws.on('open', () => {
    onStateChange('connected', 'Yamux tunnel connected');
    
    const duplex = createWebSocketStream(ws);
    duplex.on('error', () => ws.terminate());
    
    const session = new Server((stream) => {
      const port = getPort();
      if (!port) {
        stream.close();
        return;
      }

      if (tunnelType === 'udp') {
        const dgram = require('node:dgram');
        const localSocket = dgram.createSocket('udp4');
        
        let headerBuffer = Buffer.alloc(0);
        stream.on('data', (data) => {
          headerBuffer = Buffer.concat([headerBuffer, data]);
          while (headerBuffer.length >= 2) {
            const len = headerBuffer.readUInt16BE(0);
            if (headerBuffer.length >= 2 + len) {
              const packet = headerBuffer.slice(2, 2 + len);
              headerBuffer = headerBuffer.slice(2 + len);
              localSocket.send(packet, port, '127.0.0.1');
            } else {
              break;
            }
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

        return; // done for UDP
      }
      
      const localSocket = net.connect(port, '127.0.0.1', () => {
        // Stream opened successfully
      });
      
      let reqLogId = null;
      let reqStartTime = null;

      // Pipe data from Yamux stream to Local Socket
      let firstReqChunk = true;
      stream.on('data', (data) => {
        if (firstReqChunk && onLogEntry) {
          firstReqChunk = false;
          try {
            const text = data.toString('utf8');
            if (/^(GET|POST|PUT|DELETE|OPTIONS|PATCH|HEAD) /.test(text)) {
              const lines = text.split('\r\n');
              const [method, path] = lines[0].split(' ');
              const headers = {};
              let bodyStr = '';
              for (let i = 1; i < lines.length; i++) {
                if (lines[i] === '') {
                  bodyStr = lines.slice(i + 1).join('\r\n');
                  break;
                }
                const [k, ...v] = lines[i].split(':');
                if (k && v.length) headers[k.trim().toLowerCase()] = v.join(':').trim();
              }
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
                body: bodyStr.substring(0, 10000)
              });
            }
          } catch {}
        }
        localSocket.write(data);
      });
      
      let firstRespChunk = true;
      localSocket.on('data', (data) => {
        if (firstRespChunk && reqLogId && onLogEntry) {
          firstRespChunk = false;
          try {
            const text = data.toString('utf8');
            if (text.startsWith('HTTP/')) {
              const lines = text.split('\r\n');
              const statusPart = lines[0].split(' ')[1];
              const status = parseInt(statusPart, 10);
              const headers = {};
              let bodyStr = '';
              for (let i = 1; i < lines.length; i++) {
                if (lines[i] === '') {
                  bodyStr = lines.slice(i + 1).join('\r\n');
                  break;
                }
                const [k, ...v] = lines[i].split(':');
                if (k && v.length) headers[k.trim().toLowerCase()] = v.join(':').trim();
              }
              onLogEntry({
                id: reqLogId, // match the request ID
                status: status || 200,
                durationMs: Date.now() - reqStartTime,
                responseHeaders: headers,
                responseBody: bodyStr.substring(0, 10000)
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
    });
    
    session.on('error', () => ws.terminate());
    currentSession = session;
    duplex.pipe(session).pipe(duplex);
  });
  
  ws.on('close', () => {
    if (currentSession) {
      currentSession = null;
      onStateChange('disconnected', 'Yamux tunnel disconnected');
    }
  });
  
  ws.on('error', (err) => {
    console.error('WebSocket Error:', err);
  });

  return {
    close() {
      if (currentWs) currentWs.close();
      if (currentSession) currentSession.close();
      currentWs = null;
      currentSession = null;
    }
  }
}

module.exports = { connectTunnel };
