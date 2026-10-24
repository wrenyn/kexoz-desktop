// Builds the platform icon files from assets/logo.png.
// Run with: npx electron scripts/generate-icons.js
const { app, nativeImage } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

const assets = path.join(__dirname, '..', 'assets');
const source = nativeImage.createFromPath(path.join(assets, 'logo.png'));

function resized(size) {
  return source.resize({ width: size, height: size, quality: 'best' });
}

// Windows wants uncompressed 32-bit DIBs for the small sizes; 256px is stored as PNG.
function dibEntry(size) {
  const bgra = resized(size).toBitmap();
  const header = Buffer.alloc(40);
  header.writeUInt32LE(40, 0);
  header.writeInt32LE(size, 4);
  header.writeInt32LE(size * 2, 8);
  header.writeUInt16LE(1, 12);
  header.writeUInt16LE(32, 14);
  const pixels = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    bgra.copy(pixels, (size - 1 - y) * size * 4, y * size * 4, (y + 1) * size * 4);
  }
  const maskRow = Math.ceil(size / 32) * 4;
  return Buffer.concat([header, pixels, Buffer.alloc(maskRow * size)]);
}

function buildIco(sizes) {
  const images = sizes.map((size) => (size >= 256 ? resized(size).toPNG() : dibEntry(size)));
  const dir = Buffer.alloc(6 + 16 * sizes.length);
  dir.writeUInt16LE(1, 2);
  dir.writeUInt16LE(sizes.length, 4);
  let offset = dir.length;
  sizes.forEach((size, i) => {
    const at = 6 + 16 * i;
    dir.writeUInt8(size >= 256 ? 0 : size, at);
    dir.writeUInt8(size >= 256 ? 0 : size, at + 1);
    dir.writeUInt16LE(1, at + 4);
    dir.writeUInt16LE(32, at + 6);
    dir.writeUInt32LE(images[i].length, at + 8);
    dir.writeUInt32LE(offset, at + 12);
    offset += images[i].length;
  });
  return Buffer.concat([dir, ...images]);
}

function buildIcns(entries) {
  const chunks = entries.map(([type, size]) => {
    const png = resized(size).toPNG();
    const head = Buffer.alloc(8);
    head.write(type, 0, 'ascii');
    head.writeUInt32BE(png.length + 8, 4);
    return Buffer.concat([head, png]);
  });
  const head = Buffer.alloc(8);
  head.write('icns', 0, 'ascii');
  head.writeUInt32BE(8 + chunks.reduce((n, c) => n + c.length, 0), 4);
  return Buffer.concat([head, ...chunks]);
}

app.whenReady().then(() => {
  if (source.isEmpty()) throw new Error('assets/logo.png could not be read');
  fs.writeFileSync(path.join(assets, 'icon.ico'), buildIco([16, 20, 24, 32, 40, 48, 64, 128, 256]));
  fs.writeFileSync(path.join(assets, 'icon.icns'), buildIcns([
    ['icp4', 16], ['icp5', 32], ['icp6', 64], ['ic07', 128], ['ic08', 256], ['ic09', 512],
    ['ic11', 32], ['ic12', 64], ['ic13', 256], ['ic14', 512],
  ]));
  fs.copyFileSync(path.join(assets, 'logo.png'), path.join(assets, 'icon.png'));
  fs.writeFileSync(path.join(assets, 'tray.png'), resized(16).toPNG());
  fs.writeFileSync(path.join(assets, 'tray@2x.png'), resized(32).toPNG());
  console.log('icons written to', assets);
  app.quit();
});
