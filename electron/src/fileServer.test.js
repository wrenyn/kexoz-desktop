// Run with: node --test src/
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { test, before, after } = require('node:test');
const { createFolderServer, describeFolder } = require('./fileServer');

const HOST = 'docs.example.test';
let workspace;
let shareRoot;
let readOnly;
let readWrite;

// Sends the path verbatim: fetch() would normalise "../" before it left.
function request(port, method, rawPath, { host = HOST, headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, method, path: rawPath, headers: { Host: host, ...headers } }, res => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

before(async () => {
  workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'kexoz-share-'));
  shareRoot = path.join(workspace, 'share');
  fs.mkdirSync(path.join(shareRoot, 'docs'), { recursive: true });
  fs.mkdirSync(path.join(shareRoot, 'private'));
  fs.mkdirSync(path.join(shareRoot, 'node_modules'));
  fs.writeFileSync(path.join(shareRoot, 'hello.txt'), 'hello world');
  fs.writeFileSync(path.join(shareRoot, 'docs', 'readme.md'), '# readme');
  fs.writeFileSync(path.join(shareRoot, 'private', 'plan.txt'), 'locked');
  fs.writeFileSync(path.join(shareRoot, '.env'), 'SECRET=1');
  fs.writeFileSync(path.join(shareRoot, 'server.KEY'), 'key');
  fs.writeFileSync(path.join(workspace, 'outside.txt'), 'outside the share');
  fs.symlinkSync(workspace, path.join(shareRoot, 'escape'), 'junction');

  readOnly = createFolderServer({ root: shareRoot, readOnly: true, excludes: ['node_modules', 'private/'], hosts: [HOST] });
  readOnly.port = await readOnly.listen();
  readWrite = createFolderServer({ root: shareRoot, readOnly: false, hosts: [HOST] });
  readWrite.port = await readWrite.listen();
});

after(() => {
  readOnly?.close();
  readWrite?.close();
  fs.rmSync(workspace, { recursive: true, force: true });
});

test('serves files and lists folders', async () => {
  const file = await request(readOnly.port, 'GET', '/hello.txt');
  assert.equal(file.status, 200);
  assert.equal(file.body.toString(), 'hello world');
  assert.equal(file.headers['content-security-policy'], 'sandbox');

  const listing = await request(readOnly.port, 'GET', '/');
  assert.equal(listing.status, 200);
  const html = listing.body.toString();
  assert.match(html, /hello\.txt/);
  assert.match(html, /docs\//);
});

test('never escapes the share root', async () => {
  const attempts = [
    '/../outside.txt',
    '/%2e%2e/outside.txt',
    '/docs/%2e%2e/%2e%2e/outside.txt',
    '/..%2foutside.txt',
    '/..%5coutside.txt',
    '/docs/..%5c..%5coutside.txt',
    `/${encodeURIComponent(path.join(workspace, 'outside.txt'))}`,
    '/C:%5cWindows%5cwin.ini',
    '/hello.txt%00.png',
    '/escape/outside.txt',
    '/escape/',
  ];
  for (const attempt of attempts) {
    const res = await request(readOnly.port, 'GET', attempt);
    assert.equal(res.status, 404, `${attempt} returned ${res.status}`);
    assert.ok(!res.body.toString().includes('outside the share'), `${attempt} leaked the outside file`);
  }
  const listing = (await request(readOnly.port, 'GET', '/')).body.toString();
  assert.ok(!listing.includes('escape'), 'a link leaving the root must not be listed');
});

test('hides secrets, excluded names and locked folders', async () => {
  for (const hidden of ['/.env', '/server.KEY', '/node_modules/', '/private/plan.txt', '/private/', '/PRIVATE/plan.txt']) {
    assert.equal((await request(readOnly.port, 'GET', hidden)).status, 404, hidden);
  }
  const listing = (await request(readOnly.port, 'GET', '/')).body.toString();
  for (const name of ['.env', 'server.KEY', 'node_modules', 'private']) {
    assert.ok(!listing.includes(`>${name}`) && !listing.includes(` ${name}`), `${name} must not be listed`);
  }
  // Secrets stay hidden even when the owner clears the exclude list.
  assert.equal((await request(readWrite.port, 'GET', '/.env')).status, 404);
});

test('rejects foreign Host headers', async () => {
  const res = await request(readOnly.port, 'GET', '/hello.txt', { host: 'evil.test' });
  assert.equal(res.status, 421);
  assert.equal((await request(readOnly.port, 'GET', '/hello.txt', { host: `127.0.0.1:${readOnly.port}` })).status, 200);
});

test('supports resumable range requests', async () => {
  const partial = await request(readOnly.port, 'GET', '/hello.txt', { headers: { Range: 'bytes=6-' } });
  assert.equal(partial.status, 206);
  assert.equal(partial.body.toString(), 'world');
  assert.equal(partial.headers['content-range'], 'bytes 6-10/11');

  const suffix = await request(readOnly.port, 'GET', '/hello.txt', { headers: { Range: 'bytes=-5' } });
  assert.equal(suffix.body.toString(), 'world');

  const stale = await request(readOnly.port, 'GET', '/hello.txt', { headers: { Range: 'bytes=6-', 'If-Range': 'W/"stale"' } });
  assert.equal(stale.status, 200, 'a changed file must restart from the beginning');

  assert.equal((await request(readOnly.port, 'GET', '/hello.txt', { headers: { Range: 'bytes=50-' } })).status, 416);
});

test('downloads a folder as a valid zip without hidden files', async () => {
  const res = await request(readOnly.port, 'GET', '/?zip');
  assert.equal(res.status, 200);
  assert.equal(res.headers['content-type'], 'application/zip');
  const zipPath = path.join(workspace, 'download.zip');
  fs.writeFileSync(zipPath, res.body);
  const entries = execFileSync('tar', ['-tf', zipPath], { encoding: 'utf8' }).split(/\r?\n/).filter(Boolean);
  assert.ok(entries.includes('hello.txt'));
  assert.ok(entries.includes('docs/readme.md'));
  for (const entry of entries) {
    assert.ok(!/(^|\/)(\.env|server\.KEY|node_modules|private|escape)(\/|$)/.test(entry), `zip leaked ${entry}`);
  }
  const extracted = path.join(workspace, 'extracted');
  fs.mkdirSync(extracted);
  execFileSync('tar', ['-xf', zipPath, '-C', extracted]);
  assert.equal(fs.readFileSync(path.join(extracted, 'docs', 'readme.md'), 'utf8'), '# readme');
});

test('lists entries with their type for search and filters', async () => {
  const html = (await request(readOnly.port, 'GET', '/')).body.toString();
  assert.match(html, /<a href="\/">share<\/a>/, 'the shared folder is named, not "root"');
  assert.match(html, /<title>share - Kexoz<\/title>/);
  assert.match(html, /id="search"/);
  assert.match(html, /data-name="hello\.txt" data-kind="document" data-size="11"/);
  assert.match(html, /data-name="docs" data-kind="folder"/);
});

test('searches subfolders without revealing hidden files', async () => {
  const find = async (where, query) => JSON.parse((await request(readOnly.port, 'GET', `${where}?find=${encodeURIComponent(query)}`)).body.toString());
  const readme = await find('/', 'READ');
  assert.deepEqual(readme.results.map(r => r.path), ['docs/readme.md']);
  assert.equal(readme.results[0].size, 8);
  assert.deepEqual((await find('/', 'hello')).results, [], 'entries of the folder itself are left to the page');
  assert.deepEqual((await find('/', 'plan')).results, [], 'locked folders stay hidden');
  assert.deepEqual((await find('/', 'outside')).results, [], 'links are not followed');
  assert.equal((await request(readOnly.port, 'GET', '/private/?find=plan')).status, 404);
});

test('zips only the selected entries', async () => {
  const picks = ['hello.txt', 'docs', '.env', 'escape', '../outside.txt', 'node_modules'].map(name => `f=${encodeURIComponent(name)}`).join('&');
  const res = await request(readOnly.port, 'GET', `/?zip&${picks}`);
  assert.equal(res.status, 200);
  assert.match(res.headers['content-disposition'], /selected\.zip/);
  const zipPath = path.join(workspace, 'selected.zip');
  fs.writeFileSync(zipPath, res.body);
  const entries = execFileSync('tar', ['-tf', zipPath], { encoding: 'utf8' }).split(/\r?\n/).filter(Boolean).sort();
  assert.deepEqual(entries, ['docs/', 'docs/readme.md', 'hello.txt']);
  assert.equal((await request(readOnly.port, 'GET', '/?zip&f=.env')).status, 404);
  assert.equal((await request(readOnly.port, 'GET', '/?zip&f=escape')).status, 404);
});

test('read-only shares refuse writes', async () => {
  assert.equal((await request(readOnly.port, 'PUT', '/new.txt', { body: 'x' })).status, 405);
  assert.equal((await request(readOnly.port, 'DELETE', '/hello.txt')).status, 405);
  assert.ok(fs.existsSync(path.join(shareRoot, 'hello.txt')));
});

test('read-write shares upload, create folders and delete safely', async () => {
  assert.equal((await request(readWrite.port, 'PUT', '/uploads/', {})).status, 201);
  assert.equal((await request(readWrite.port, 'PUT', '/uploads/note.txt', { body: 'uploaded' })).status, 201);
  assert.equal(fs.readFileSync(path.join(shareRoot, 'uploads', 'note.txt'), 'utf8'), 'uploaded');
  assert.equal((await request(readWrite.port, 'PUT', '/uploads/note.txt', { body: 'replaced' })).status, 200);
  assert.equal(fs.readFileSync(path.join(shareRoot, 'uploads', 'note.txt'), 'utf8'), 'replaced');

  assert.equal((await request(readWrite.port, 'PUT', '/../evil.txt', { body: 'x' })).status, 404);
  assert.equal((await request(readWrite.port, 'PUT', '/escape/evil.txt', { body: 'x' })).status, 404);
  assert.equal((await request(readWrite.port, 'PUT', '/.env', { body: 'x' })).status, 404);
  assert.equal((await request(readWrite.port, 'PUT', '/CON', { body: 'x' })).status, 400);
  assert.ok(!fs.existsSync(path.join(workspace, 'evil.txt')));
  assert.equal(fs.readFileSync(path.join(shareRoot, '.env'), 'utf8'), 'SECRET=1');

  assert.equal((await request(readWrite.port, 'DELETE', '/uploads/')).status, 409, 'non-empty folders are not deleted');
  assert.equal((await request(readWrite.port, 'DELETE', '/uploads/note.txt')).status, 204);
  assert.equal((await request(readWrite.port, 'DELETE', '/uploads/')).status, 204);
  assert.equal((await request(readWrite.port, 'DELETE', '/escape')).status, 404, 'links are never deleted through');
  assert.equal((await request(readWrite.port, 'DELETE', '/')).status, 404, 'the root cannot be deleted');
  assert.ok(fs.existsSync(path.join(workspace, 'outside.txt')));
});

test('flags drive roots and the home folder', async () => {
  const driveRoot = path.parse(process.cwd()).root;
  assert.equal((await describeFolder(driveRoot, os.homedir())).isDriveRoot, true);
  assert.equal((await describeFolder(os.homedir(), os.homedir())).isHome, true);
  const plain = await describeFolder(shareRoot, os.homedir());
  assert.equal(plain.isDriveRoot, false);
  assert.equal(plain.isHome, false);
  assert.equal(plain.isDirectory, true);
});

test('stops serving downloads once the limit is reached', async () => {
  const counts = [];
  const limited = createFolderServer({ root: shareRoot, hosts: [HOST], maxDownloads: 2, downloadsUsed: 1, onDownload: count => counts.push(count) });
  const port = await limited.listen();
  try {
    const listing = await request(port, 'GET', '/');
    assert.match(listing.body.toString(), /1 of 2 downloads left/);
    const resumed = await request(port, 'GET', '/hello.txt', { headers: { Range: 'bytes=3-' } });
    assert.equal(resumed.status, 206, 'continuing a download does not count');
    assert.equal((await request(port, 'GET', '/hello.txt?download')).status, 200);
    assert.deepEqual(counts, [2]);
    assert.equal((await request(port, 'GET', '/hello.txt')).status, 410);
    assert.equal((await request(port, 'GET', '/docs/?zip')).status, 410);
    assert.equal((await request(port, 'GET', '/')).status, 200, 'browsing still works');
  } finally {
    limited.close();
  }
});
