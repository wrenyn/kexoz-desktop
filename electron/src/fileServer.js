// fileServer.js — serves one shared folder on a loopback port for a folder share.
//
// The tunnel forwards visitors here, so this is the last line of defence:
// every path is resolved inside the share root and re-checked after symlinks
// are followed, secrets and excluded names are invisible, writes need
// read-write, and only the share's own hostnames are answered (a DNS-rebinding
// page on the owner's machine must not bypass the gateway's auth wall).

const crypto = require('node:crypto');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const http = require('node:http');
const path = require('node:path');
const zlib = require('node:zlib');

// Hidden in every share, whatever the owner's exclude list says.
const SECRET_PATTERNS = [
  '.env', '.env.*', '*.pem', '*.key', '*.p12', '*.pfx', '*.kdbx',
  'id_rsa', 'id_rsa.*', 'id_dsa', 'id_ecdsa', 'id_ed25519', 'id_ed25519.*',
  '.ssh', '.aws', '.gnupg', '.npmrc', '.netrc', '.pgpass', '.git-credentials',
];

const DEFAULT_EXCLUDES = ['.git', 'node_modules'];

const MIME_TYPES = {
  '.html': 'text/html', '.htm': 'text/html', '.css': 'text/css', '.js': 'text/plain', '.mjs': 'text/plain',
  '.json': 'application/json', '.txt': 'text/plain', '.md': 'text/plain', '.csv': 'text/plain', '.log': 'text/plain',
  '.xml': 'text/plain', '.yml': 'text/plain', '.yaml': 'text/plain', '.toml': 'text/plain', '.ini': 'text/plain',
  '.ts': 'text/plain', '.tsx': 'text/plain', '.jsx': 'text/plain', '.go': 'text/plain', '.py': 'text/plain',
  '.rs': 'text/plain', '.java': 'text/plain', '.c': 'text/plain', '.h': 'text/plain', '.cpp': 'text/plain',
  '.sh': 'text/plain', '.ps1': 'text/plain', '.sql': 'text/plain',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.avif': 'image/avif', '.bmp': 'image/bmp',
  '.mp4': 'video/mp4', '.webm': 'video/webm', '.mov': 'video/quicktime', '.mkv': 'video/x-matroska',
  '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg', '.m4a': 'audio/mp4', '.flac': 'audio/flac',
  '.pdf': 'application/pdf', '.zip': 'application/zip',
};

const WINDOWS_RESERVED = /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(\..*)?$/i;

function escapeRegExp(value) {
  return value.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
}

// Patterns without a slash match any single path segment ("*.log", ".git");
// patterns with one lock a path relative to the root ("private/", "docs/old").
function compileRules(patterns) {
  return patterns
    .map(pattern => String(pattern).trim().replace(/\\/g, '/'))
    .filter(Boolean)
    .map(pattern => {
      if (pattern.includes('/')) {
        return { kind: 'path', prefix: pattern.replace(/^\/+|\/+$/g, '').toLowerCase() };
      }
      const source = '^' + pattern.split('*').map(escapeRegExp).join('.*') + '$';
      return { kind: 'name', re: new RegExp(source, 'i') };
    })
    .filter(rule => rule.kind === 'name' || rule.prefix);
}

function isExcluded(rules, relative) {
  if (!relative) return false;
  const lower = relative.toLowerCase();
  const segments = relative.split('/');
  return rules.some(rule => rule.kind === 'path'
    ? lower === rule.prefix || lower.startsWith(rule.prefix + '/')
    : segments.some(segment => rule.re.test(segment)));
}

function isWithin(root, target) {
  const relative = path.relative(root, target);
  return relative === '' || (relative.split(path.sep)[0] !== '..' && !path.isAbsolute(relative));
}

function toPosix(relative) {
  return relative.split(path.sep).join('/');
}

function validName(name) {
  return Boolean(name) && name !== '.' && name !== '..' &&
    !/[<>:"|?*\u0000-\u001f]/.test(name) && !/[. ]$/.test(name) && !WINDOWS_RESERVED.test(name);
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}

function encodePath(relative) {
  return relative.split('/').filter(Boolean).map(encodeURIComponent).join('/');
}

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${value.toFixed(value < 10 ? 1 : 0)} ${units[unit]}`;
}

function crc32(crc, chunk) {
  if (typeof zlib.crc32 === 'function') return zlib.crc32(chunk, crc);
  let c = crc ^ 0xffffffff;
  for (let i = 0; i < chunk.length; i++) {
    c ^= chunk[i];
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  return (c ^ 0xffffffff) >>> 0;
}

function dosDateTime(date) {
  const year = Math.max(date.getFullYear(), 1980);
  return {
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2),
    date: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
  };
}

function createFolderServer({ root, readOnly = true, excludes = DEFAULT_EXCLUDES, hosts = [], maxDownloads = 0, downloadsUsed = 0, onDownload = () => {} }) {
  const rules = compileRules([...SECRET_PATTERNS, ...excludes]);
  let downloads = Math.max(0, Number(downloadsUsed) || 0);
  const limit = Math.max(0, Math.floor(Number(maxDownloads) || 0));
  const limitReached = () => limit > 0 && downloads >= limit;
  const countDownload = () => {
    downloads += 1;
    try { onDownload(downloads); } catch { /* reporting is best effort */ }
  };
  // Loopback names stay allowed so the owner can preview locally; a rebinding
  // page cannot make a browser send them for its own origin.
  const allowedHosts = new Set(['127.0.0.1', 'localhost', ...hosts.map(host => String(host).toLowerCase())].filter(Boolean));
  let rootReal = null;

  // Maps a URL path onto the share. Returns null for anything that is outside
  // the root, excluded, or malformed — callers answer 404 so hidden files are
  // indistinguishable from missing ones.
  function resolveRequestPath(urlPath) {
    let decoded;
    try {
      decoded = decodeURIComponent(urlPath);
    } catch {
      return null;
    }
    if (decoded.includes('\0')) return null;
    const segments = decoded.split(/[\\/]+/).filter(Boolean);
    if (segments.some(segment => segment === '.' || segment === '..' || segment.includes(':'))) return null;
    const relative = segments.join('/');
    if (isExcluded(rules, relative)) return null;
    return { absolute: path.join(rootReal, ...segments), relative, segments };
  }

  async function realInside(absolute) {
    let real;
    try {
      real = await fsp.realpath(absolute);
    } catch {
      return null;
    }
    if (!isWithin(rootReal, real) || isExcluded(rules, toPosix(path.relative(rootReal, real)))) return null;
    return real;
  }

  async function visibleEntries(directory) {
    const dirents = await fsp.readdir(directory, { withFileTypes: true });
    const entries = [];
    for (const dirent of dirents) {
      const absolute = path.join(directory, dirent.name);
      const real = await realInside(absolute);
      if (!real) continue;
      try {
        const stat = await fsp.stat(real);
        if (!stat.isFile() && !stat.isDirectory()) continue;
        entries.push({ name: dirent.name, absolute, isDirectory: stat.isDirectory(), isLink: dirent.isSymbolicLink(), size: stat.size, mtime: stat.mtime });
      } catch {
        // Vanished or unreadable entries are simply not listed.
      }
    }
    entries.sort((a, b) => (a.isDirectory === b.isDirectory ? a.name.localeCompare(b.name) : a.isDirectory ? -1 : 1));
    return entries;
  }

  function send(res, status, message) {
    res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(message);
  }

  async function serveListing(req, res, target) {
    const entries = await visibleEntries(target.real);
    const nonce = crypto.randomBytes(16).toString('base64');
    const base = target.relative ? `/${encodePath(target.relative)}/` : '/';
    const crumbs = ['<a href="/">root</a>'];
    target.segments.forEach((segment, index) => {
      crumbs.push(`<a href="/${encodePath(target.segments.slice(0, index + 1).join('/'))}/">${escapeHtml(segment)}</a>`);
    });
    const rows = entries.map(entry => {
      const href = base + encodeURIComponent(entry.name) + (entry.isDirectory ? '/' : '');
      const actions = [];
      if (!entry.isDirectory) actions.push(`<a href="${href}?download">Download</a>`);
      else if (!entry.isLink) actions.push(`<a href="${href}?zip">Zip</a>`);
      if (!readOnly && !entry.isLink) actions.push(`<button type="button" data-delete="${escapeHtml(href)}" data-name="${escapeHtml(entry.name)}">Delete</button>`);
      return `<tr><td class="name"><a href="${href}">${entry.isDirectory ? '&#128193;' : '&#128196;'} ${escapeHtml(entry.name)}${entry.isDirectory ? '/' : ''}</a></td>` +
        `<td>${entry.isDirectory ? '' : formatSize(entry.size)}</td><td>${entry.mtime.toISOString().slice(0, 16).replace('T', ' ')}</td>` +
        `<td class="actions">${actions.join(' ')}</td></tr>`;
    }).join('');
    const writeControls = readOnly ? '' : `
      <div class="write">
        <label class="btn">Upload files<input id="upload" type="file" multiple hidden></label>
        <button type="button" class="btn btn-ghost" id="mkdir">New folder</button>
        <span id="status"></span>
      </div>
      <script nonce="${nonce}">
        const base = ${JSON.stringify(base)};
        const status = document.getElementById('status');
        const done = response => { if (!response.ok) throw new Error(response.status + ' ' + response.statusText); };
        document.getElementById('upload').addEventListener('change', async event => {
          try {
            for (const file of event.target.files) {
              status.textContent = 'Uploading ' + file.name + '...';
              done(await fetch(base + encodeURIComponent(file.name), { method: 'PUT', body: file }));
            }
            location.reload();
          } catch (error) { status.textContent = 'Upload failed: ' + error.message; }
        });
        document.getElementById('mkdir').addEventListener('click', async () => {
          const name = prompt('Folder name');
          if (!name) return;
          try { done(await fetch(base + encodeURIComponent(name) + '/', { method: 'PUT' })); location.reload(); }
          catch (error) { status.textContent = 'Could not create folder: ' + error.message; }
        });
        document.querySelectorAll('[data-delete]').forEach(button => button.addEventListener('click', async () => {
          if (!confirm('Delete ' + button.dataset.name + '?')) return;
          try { done(await fetch(button.dataset.delete, { method: 'DELETE' })); location.reload(); }
          catch (error) { status.textContent = 'Could not delete: ' + error.message; }
        }));
      </script>`;
    const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(target.relative || 'Shared folder')} - Kexoz</title>
<style nonce="${nonce}">
  body{margin:0;font:14px/1.5 Inter,ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;background:#202322;color:#E9EDE6}
  ::selection{background:rgba(198,243,107,.35)}
  main{max-width:960px;margin:0 auto;padding:32px 20px}
  header{display:flex;flex-wrap:wrap;gap:12px;align-items:center;justify-content:space-between;margin-bottom:16px}
  .crumbs{font:600 16px/1.4 "Space Grotesk",Inter,ui-sans-serif,system-ui,sans-serif;letter-spacing:-.01em}.crumbs a{color:#FFFFFF;text-decoration:none}.crumbs a:hover{color:#C6F36B}
  .crumbs span{color:#7D877F;margin:0 6px}
  .badge{font-size:11px;font-weight:600;letter-spacing:.05em;text-transform:uppercase;padding:3px 9px;border-radius:999px;border:1px solid #48514C;color:#A7B0A9}
  table{width:100%;border-collapse:collapse;background:#272B29;border:1px solid #343B37;border-radius:10px;overflow:hidden}
  td{padding:9px 12px;border-top:1px solid #343B37;color:#A7B0A9;white-space:nowrap;font-family:"IBM Plex Mono",ui-monospace,Consolas,monospace;font-size:12.5px}
  tr:first-child td{border-top:none}td.name{width:100%;white-space:normal;word-break:break-all;font-family:inherit;font-size:14px}
  tr:hover td{background:rgba(233,237,230,.03)}
  td.name a{color:#E9EDE6;text-decoration:none}td.name a:hover{color:#C6F36B}
  .actions a,.actions button{color:#C6F36B;background:none;border:none;font:inherit;cursor:pointer;padding:0;margin-left:10px;text-decoration:none}
  .actions a:hover{text-decoration:underline}
  .actions button{color:#F87171}
  .btn{display:inline-block;background:#C6F36B;color:#202322;border:none;border-radius:8px;padding:7px 12px;font:600 13px Inter,ui-sans-serif,system-ui,sans-serif;cursor:pointer;text-decoration:none}
  .btn:hover{background:#D3F78A}
  .btn-ghost{background:transparent;color:#E9EDE6;border:1px solid #48514C}.btn-ghost:hover{background:#343B37}
  a:focus-visible,button:focus-visible{outline:2px solid #C6F36B;outline-offset:2px}
  .write{display:flex;gap:8px;align-items:center;margin-bottom:12px}#status{color:#A7B0A9;font-size:13px}
  .empty{padding:28px;text-align:center;color:#7D877F}
</style></head><body><main>
<header><div class="crumbs">${crumbs.join('<span>/</span>')}</div>
<div><span class="badge">${readOnly ? 'Read-only' : 'Read &amp; write'}</span>${limit > 0 ? ` <span class="badge">${limitReached() ? 'No downloads left' : `${limit - downloads} of ${limit} downloads left`}</span>` : ''} <a class="btn" href="${base}?zip">Download folder (.zip)</a></div></header>
${writeControls}
<table>${rows || '<tr><td class="empty" colspan="4">This folder is empty.</td></tr>'}</table>
</main></body></html>`;
    res.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'Content-Security-Policy': `default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}'; img-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`,
    });
    res.end(req.method === 'HEAD' ? undefined : html);
  }

  async function serveFile(req, res, target, stat, query) {
    const ext = path.extname(target.real).toLowerCase();
    const type = MIME_TYPES[ext] || 'application/octet-stream';
    const etag = `W/"${stat.size.toString(16)}-${Math.floor(stat.mtimeMs).toString(16)}"`;
    const lastModified = stat.mtime.toUTCString();
    const headers = {
      'Content-Type': type.startsWith('text/') ? `${type}; charset=utf-8` : type,
      'Accept-Ranges': 'bytes',
      'ETag': etag,
      'Last-Modified': lastModified,
      'Cache-Control': 'no-cache',
      // Shared HTML/SVG must never run script on the share's origin.
      'Content-Security-Policy': 'sandbox',
    };
    const filename = path.basename(target.real);
    headers['Content-Disposition'] = `${query.has('download') ? 'attachment' : 'inline'}; filename*=UTF-8''${encodeURIComponent(filename)}`;

    let start = 0;
    let end = stat.size - 1;
    let status = 200;
    const range = req.headers.range;
    const ifRange = req.headers['if-range'];
    const rangeApplies = range && (!ifRange || ifRange === etag || ifRange === lastModified);
    if (rangeApplies) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
      if (!match || (match[1] === '' && match[2] === '')) {
        res.writeHead(416, { 'Content-Range': `bytes */${stat.size}` });
        res.end();
        return;
      }
      if (match[1] === '') {
        start = Math.max(0, stat.size - Number(match[2]));
      } else {
        start = Number(match[1]);
        if (match[2] !== '') end = Math.min(end, Number(match[2]));
      }
      if (start > end || start >= stat.size) {
        res.writeHead(416, { 'Content-Range': `bytes */${stat.size}` });
        res.end();
        return;
      }
      status = 206;
      headers['Content-Range'] = `bytes ${start}-${end}/${stat.size}`;
    }
    const counts = req.method !== 'HEAD' && start === 0;
    if (counts && limitReached()) return send(res, 410, 'This share has reached its download limit.');
    headers['Content-Length'] = stat.size === 0 ? 0 : end - start + 1;
    res.writeHead(status, headers);
    if (counts) countDownload();
    if (req.method === 'HEAD' || stat.size === 0) {
      res.end();
      return;
    }
    const stream = fs.createReadStream(target.real, { start, end });
    stream.on('error', () => res.destroy());
    res.on('close', () => stream.destroy());
    stream.pipe(res);
  }

  // Streams a folder as a stored (uncompressed) zip with data descriptors, so
  // nothing is buffered and the download starts immediately. Symlinks are
  // skipped to avoid loops; zip32 limits are enforced rather than corrupting.
  async function serveZip(req, res, target) {
    const zipName = `${target.segments[target.segments.length - 1] || path.basename(rootReal) || 'share'}.zip`;
    if (req.method !== 'HEAD') {
      if (limitReached()) return send(res, 410, 'This share has reached its download limit.');
      countDownload();
    }
    res.writeHead(200, {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(zipName)}`,
      'Cache-Control': 'no-store',
    });
    if (req.method === 'HEAD') {
      res.end();
      return;
    }
    let aborted = false;
    res.on('close', () => { aborted = true; });
    let offset = 0;
    const central = [];

    const write = chunk => new Promise((resolve, reject) => {
      if (aborted) return reject(new Error('client went away'));
      offset += chunk.length;
      if (offset > 0xffffffff) return reject(new Error('zip exceeds 4 GB'));
      if (res.write(chunk)) return resolve();
      const onClose = () => reject(new Error('client went away'));
      res.once('close', onClose);
      res.once('drain', () => {
        res.off('close', onClose);
        resolve();
      });
    });

    const addEntry = async (name, absolute, stat) => {
      if (central.length >= 0xffff) throw new Error('too many files for a zip');
      const nameBuffer = Buffer.from(name, 'utf8');
      const { time, date } = dosDateTime(stat.mtime);
      const localOffset = offset;
      const header = Buffer.alloc(30);
      header.writeUInt32LE(0x04034b50, 0);
      header.writeUInt16LE(20, 4);
      header.writeUInt16LE(0x0808, 6);
      header.writeUInt16LE(0, 8);
      header.writeUInt16LE(time, 10);
      header.writeUInt16LE(date, 12);
      header.writeUInt16LE(nameBuffer.length, 26);
      await write(Buffer.concat([header, nameBuffer]));
      let crc = 0;
      let size = 0;
      if (absolute) {
        for await (const chunk of fs.createReadStream(absolute)) {
          crc = crc32(crc, chunk);
          size += chunk.length;
          await write(chunk);
        }
      }
      const descriptor = Buffer.alloc(16);
      descriptor.writeUInt32LE(0x08074b50, 0);
      descriptor.writeUInt32LE(crc, 4);
      descriptor.writeUInt32LE(size, 8);
      descriptor.writeUInt32LE(size, 12);
      await write(descriptor);
      central.push({ nameBuffer, time, date, crc, size, localOffset, isDirectory: !absolute });
    };

    const walk = async (directory, prefix) => {
      const dirents = await fsp.readdir(directory, { withFileTypes: true });
      for (const dirent of dirents) {
        if (dirent.isSymbolicLink()) continue;
        const relative = prefix ? `${prefix}/${dirent.name}` : dirent.name;
        const fromRoot = toPosix(path.relative(rootReal, path.join(directory, dirent.name)));
        if (isExcluded(rules, fromRoot)) continue;
        const absolute = path.join(directory, dirent.name);
        let stat;
        try {
          stat = await fsp.stat(absolute);
        } catch {
          continue;
        }
        if (dirent.isDirectory()) {
          await addEntry(`${relative}/`, null, stat);
          await walk(absolute, relative);
        } else if (dirent.isFile()) {
          await addEntry(relative, absolute, stat);
        }
      }
    };

    try {
      await walk(target.real, '');
      const centralStart = offset;
      for (const entry of central) {
        const record = Buffer.alloc(46);
        record.writeUInt32LE(0x02014b50, 0);
        record.writeUInt16LE(20, 4);
        record.writeUInt16LE(20, 6);
        record.writeUInt16LE(0x0808, 8);
        record.writeUInt16LE(0, 10);
        record.writeUInt16LE(entry.time, 12);
        record.writeUInt16LE(entry.date, 14);
        record.writeUInt32LE(entry.crc, 16);
        record.writeUInt32LE(entry.size, 20);
        record.writeUInt32LE(entry.size, 24);
        record.writeUInt16LE(entry.nameBuffer.length, 28);
        record.writeUInt32LE(entry.isDirectory ? 0x10 : 0, 38);
        record.writeUInt32LE(entry.localOffset, 42);
        await write(Buffer.concat([record, entry.nameBuffer]));
      }
      const end = Buffer.alloc(22);
      end.writeUInt32LE(0x06054b50, 0);
      end.writeUInt16LE(central.length, 8);
      end.writeUInt16LE(central.length, 10);
      end.writeUInt32LE(offset - centralStart, 12);
      end.writeUInt32LE(centralStart, 16);
      await write(end);
      res.end();
    } catch {
      res.destroy();
    }
  }

  // PUT /dir/name uploads a file, PUT /dir/name/ creates a folder. Uploads land
  // in a temporary file and are renamed into place only once complete.
  async function handlePut(req, res, urlPath) {
    const target = resolveRequestPath(urlPath);
    if (!target || target.segments.length === 0) return send(res, 404, 'Not found');
    const name = target.segments[target.segments.length - 1];
    if (!validName(name)) return send(res, 400, 'Invalid name');
    const parent = await realInside(path.dirname(target.absolute));
    if (!parent) return send(res, 404, 'Not found');
    const parentStat = await fsp.stat(parent).catch(() => null);
    if (!parentStat || !parentStat.isDirectory()) return send(res, 409, 'Parent is not a folder');
    const destination = path.join(parent, name);
    const existing = await fsp.lstat(destination).catch(() => null);

    if (urlPath.endsWith('/')) {
      if (existing) return send(res, 409, 'Already exists');
      await fsp.mkdir(destination);
      return send(res, 201, 'Created');
    }
    if (existing && !existing.isFile()) return send(res, 409, 'A folder or link with that name exists');

    const temporary = path.join(parent, `.${name}.kexoz-upload-${crypto.randomBytes(6).toString('hex')}`);
    const out = fs.createWriteStream(temporary, { flags: 'wx' });
    let finished = false;
    const cleanup = () => {
      if (!finished) fsp.unlink(temporary).catch(() => {});
    };
    req.on('aborted', cleanup);
    out.on('error', () => {
      cleanup();
      if (!res.headersSent) send(res, 500, 'Could not write file');
    });
    out.on('finish', async () => {
      try {
        await fsp.rename(temporary, destination);
        finished = true;
        send(res, existing ? 200 : 201, existing ? 'Replaced' : 'Created');
      } catch {
        cleanup();
        send(res, 500, 'Could not save file');
      }
    });
    req.pipe(out);
  }

  // Deletes a file or an empty folder. Recursive deletes are deliberately not
  // offered over a link.
  async function handleDelete(res, urlPath) {
    const target = resolveRequestPath(urlPath);
    if (!target || target.segments.length === 0) return send(res, 404, 'Not found');
    const parent = await realInside(path.dirname(target.absolute));
    if (!parent) return send(res, 404, 'Not found');
    const victim = path.join(parent, target.segments[target.segments.length - 1]);
    const stat = await fsp.lstat(victim).catch(() => null);
    if (!stat || stat.isSymbolicLink()) return send(res, 404, 'Not found');
    try {
      if (stat.isDirectory()) await fsp.rmdir(victim);
      else await fsp.unlink(victim);
      send(res, 204, '');
    } catch (error) {
      send(res, error && error.code === 'ENOTEMPTY' ? 409 : 500, error && error.code === 'ENOTEMPTY' ? 'Folder is not empty' : 'Could not delete');
    }
  }

  async function handle(req, res) {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Frame-Options', 'DENY');

    const host = String(req.headers.host || '').toLowerCase().replace(/:\d+$/, '');
    if (!allowedHosts.has(host)) return send(res, 421, 'Misdirected request');

    // URL parsing would quietly fold "/../x" into "/x"; refuse it instead so a
    // traversal attempt never turns into a different read or write.
    const rawPath = String(req.url || '').split('?')[0];
    if (rawPath.split('/').some(segment => segment === '.' || segment === '..')) return send(res, 404, 'Not found');
    let url;
    try {
      url = new URL(req.url, 'http://share.local');
    } catch {
      return send(res, 400, 'Bad request');
    }
    const urlPath = url.pathname;

    if (req.method === 'PUT' || req.method === 'DELETE') {
      if (readOnly) {
        res.setHeader('Allow', 'GET, HEAD');
        return send(res, 405, 'This share is read-only');
      }
      return req.method === 'PUT' ? handlePut(req, res, urlPath) : handleDelete(res, urlPath);
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.setHeader('Allow', readOnly ? 'GET, HEAD' : 'GET, HEAD, PUT, DELETE');
      return send(res, 405, 'Method not allowed');
    }

    const target = resolveRequestPath(urlPath);
    if (!target) return send(res, 404, 'Not found');
    const real = await realInside(target.absolute);
    if (!real) return send(res, 404, 'Not found');
    const stat = await fsp.stat(real).catch(() => null);
    if (!stat) return send(res, 404, 'Not found');
    const resolved = { ...target, real };

    if (stat.isDirectory()) {
      if (!urlPath.endsWith('/')) {
        res.writeHead(301, { Location: `${urlPath}/${url.search}` });
        return res.end();
      }
      return url.searchParams.has('zip') ? serveZip(req, res, resolved) : serveListing(req, res, resolved);
    }
    if (!stat.isFile()) return send(res, 404, 'Not found');
    return serveFile(req, res, resolved, stat, url.searchParams);
  }

  const server = http.createServer((req, res) => {
    handle(req, res).catch(() => {
      if (!res.headersSent) send(res, 500, 'Internal error');
      else res.destroy();
    });
  });

  return {
    async listen() {
      rootReal = await fsp.realpath(root);
      const stat = await fsp.stat(rootReal);
      if (!stat.isDirectory()) throw new Error('The shared path is not a folder');
      await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(0, '127.0.0.1', resolve);
      });
      this.port = server.address().port;
      return this.port;
    },
    port: 0,
    get downloads() { return downloads; },
    close() {
      server.closeAllConnections?.();
      server.close();
    },
  };
}

// describeFolder flags roots that are too broad to share without a hard
// warning: a whole drive (C:\, /) or the user's home folder.
async function describeFolder(folder, homeDir) {
  const resolved = path.resolve(String(folder || ''));
  const stat = await fsp.stat(resolved).catch(() => null);
  const trimmed = resolved.replace(/[\\/]+$/, '');
  const driveRoot = path.parse(resolved).root;
  return {
    path: resolved,
    exists: Boolean(stat),
    isDirectory: Boolean(stat && stat.isDirectory()),
    isDriveRoot: resolved === driveRoot || trimmed === driveRoot.replace(/[\\/]+$/, ''),
    isHome: Boolean(homeDir) && path.relative(path.resolve(homeDir), resolved) === '',
  };
}

module.exports = { createFolderServer, describeFolder, compileRules, isExcluded, SECRET_PATTERNS, DEFAULT_EXCLUDES };
