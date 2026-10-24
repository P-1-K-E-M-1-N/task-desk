// Draws the app icon (clay rounded square with a cream check mark) as PNG/ICO
// without any image libraries.
const zlib = require('zlib');

const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

function segDist(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - ax - t * dx, py - ay - t * dy);
}

function png(size) {
  const rows = [];
  const r = size * 0.24;
  const half = size / 2;
  const stroke = size * 0.085;
  for (let y = 0; y < size; y++) {
    const row = Buffer.alloc(1 + size * 4);
    for (let x = 0; x < size; x++) {
      const px = x + 0.5, py = y + 0.5;
      // rounded square signed distance
      const qx = Math.abs(px - half) - (half - r - size * 0.02);
      const qy = Math.abs(py - half) - (half - r - size * 0.02);
      const d = Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
      const a = Math.max(0, Math.min(1, 0.5 - d));
      // vertical clay gradient
      const g = py / size;
      let R = 217 - 22 * g, G = 119 - 22 * g, B = 87 - 18 * g;
      // check mark
      const cd = Math.min(
        segDist(px, py, size * 0.29, size * 0.52, size * 0.44, size * 0.67),
        segDist(px, py, size * 0.44, size * 0.67, size * 0.72, size * 0.36),
      );
      const ca = Math.max(0, Math.min(1, stroke - cd + 0.5));
      R = R * (1 - ca) + 250 * ca; G = G * (1 - ca) + 246 * ca; B = B * (1 - ca) + 239 * ca;
      const o = 1 + x * 4;
      row[o] = R; row[o + 1] = G; row[o + 2] = B; row[o + 3] = Math.round(a * 255);
    }
    rows.push(row);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(Buffer.concat(rows))),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ICO files may embed PNGs directly.
function ico(sizes = [16, 32, 48, 256]) {
  const imgs = sizes.map(png);
  const head = Buffer.alloc(6 + 16 * sizes.length);
  head.writeUInt16LE(1, 2); head.writeUInt16LE(sizes.length, 4);
  let off = head.length;
  sizes.forEach((s, i) => {
    const e = 6 + 16 * i;
    head[e] = s >= 256 ? 0 : s; head[e + 1] = s >= 256 ? 0 : s;
    head.writeUInt16LE(1, e + 4); head.writeUInt16LE(32, e + 6);
    head.writeUInt32LE(imgs[i].length, e + 8); head.writeUInt32LE(off, e + 12);
    off += imgs[i].length;
  });
  return Buffer.concat([head, ...imgs]);
}

module.exports = { png, ico };
