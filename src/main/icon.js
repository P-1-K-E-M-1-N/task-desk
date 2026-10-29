// Draws the app icon (blue "ocean" tile with flowing waves and a white spark)
// as PNG/ICO without any image libraries. Regenerate assets/ with:
//   node -e "const i=require('./src/main/icon');require('fs').writeFileSync('assets/icon.png',i.png(256));require('fs').writeFileSync('assets/icon.ico',i.ico())"
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

// The picture, in units of the icon's width (0..1). Returns [r, g, b, alpha].
// A rounded tile in a deep-blue-to-aqua "ocean" gradient, two soft waves
// flowing across the bottom, and a bright starburst spark above them.
const RAYS = [1, 0.86, 0.95, 0.82, 1, 0.88, 0.93, 0.84, 0.98, 0.85]; // ray lengths, so it feels hand-drawn
const mix = (a, b, t) => a + (b - a) * t;
const clamp = (v) => Math.max(0, Math.min(1, v));
function sample(u, v, px) {
  // rounded square (soft edge about one pixel wide)
  const r = 0.235, h = 0.5 - 0.02;
  const qx = Math.abs(u - 0.5) - (h - r), qy = Math.abs(v - 0.5) - (h - r);
  const d = Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
  if (d > px) return [0, 0, 0, 0];
  // diagonal ocean gradient: deep navy blue (top left) to bright aqua (bottom right)
  const g = clamp((u * 0.45 + v * 0.75) / 1.2);
  let R = mix(22, 38, g), G = mix(64, 170, g), B = mix(168, 232, g);
  // two flowing waves, lighter toward the bottom
  for (const [base, amp, len, ph, k] of [[0.7, 0.035, 0.62, 0.3, 0.16], [0.8, 0.03, 0.5, 2.1, 0.2]]) {
    const wy = base + amp * Math.sin((u / len) * Math.PI * 2 + ph);
    const t = clamp((v - wy) / px + 0.5) * k;
    R = mix(R, 210, t); G = mix(G, 245, t); B = mix(B, 255, t);
  }
  // starburst spark: tapered rays around a small core
  const cx = 0.5, cy = 0.43, L = 0.25, w0 = 0.036;
  const dx = u - cx, dy = v - cy, rr = Math.hypot(dx, dy);
  let s = clamp((0.075 - rr) / px + 0.5);
  RAYS.forEach((len, i) => {
    const ang = (i / RAYS.length) * Math.PI * 2 - Math.PI / 2 + 0.13;
    const ex = Math.cos(ang), ey = Math.sin(ang);
    const Lk = L * len;
    // a soft petal: narrows a little toward a rounded end
    const t = Math.max(0, Math.min(Lk, dx * ex + dy * ey));
    const dist = Math.hypot(dx - ex * t, dy - ey * t);
    const w = w0 * (1 - 0.4 * t / Lk);
    s = Math.max(s, clamp((w - dist) / px + 0.5));
  });
  // a faint glow behind the spark
  const glow = clamp(1 - rr / 0.36) ** 2 * 0.22;
  R = mix(R, 160, glow); G = mix(G, 225, glow); B = mix(B, 255, glow);
  R = mix(R, 252, s); G = mix(G, 253, s); B = mix(B, 255, s);
  return [R, G, B, clamp(0.5 - d / px)];
}

function png(size) {
  const rows = [];
  const N = size <= 64 ? 4 : 3; // sub-samples per side, for smooth edges at small sizes
  const px = 1 / size;
  for (let y = 0; y < size; y++) {
    const row = Buffer.alloc(1 + size * 4);
    for (let x = 0; x < size; x++) {
      let R = 0, G = 0, B = 0, A = 0;
      for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
        const [r, g, b, a] = sample((x + (i + 0.5) / N) * px, (y + (j + 0.5) / N) * px, px / N);
        R += r * a; G += g * a; B += b * a; A += a;
      }
      const o = 1 + x * 4;
      if (A > 0) { row[o] = Math.round(R / A); row[o + 1] = Math.round(G / A); row[o + 2] = Math.round(B / A); }
      row[o + 3] = Math.round((A / (N * N)) * 255);
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
function ico(sizes = [16, 20, 24, 32, 40, 48, 64, 256]) {
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
