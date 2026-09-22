/**
 * Génère les icônes PWA (PNG 192 et 512) sans dépendance externe :
 * dessin programmatique d'un "M" (MATHIC) sur fond sombre, encodage
 * PNG manuel via zlib (node intégré).
 *
 * Usage : node scripts/gen-icons.mjs
 */

import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';

/** CRC32 (table) pour les chunks PNG. */
const crcTable = (() => {
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
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

/**
 * Encode un buffer RGBA (width*height*4) en PNG.
 */
function encodePNG(width, height, rgba) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  // raw : chaque ligne précédée du filtre 0
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0;
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  const idat = deflateSync(raw, { level: 9 });
  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/**
 * Dessine l'icône : fond dégradé sombre, coins arrondis, "M" accent.
 * @param {number} size
 * @returns {Buffer}
 */
function drawIcon(size) {
  const rgba = Buffer.alloc(size * size * 4);
  const radius = size * 0.18;
  const accent = [79, 209, 197]; // #4fd1c5

  const inRoundedRect = (x, y) => {
    const r = radius;
    const cx = Math.min(Math.max(x, r), size - r);
    const cy = Math.min(Math.max(y, r), size - r);
    return (x - cx) ** 2 + (y - cy) ** 2 <= r * r || (x >= r && x <= size - r) || (y >= r && y <= size - r);
  };

  // Géométrie du "M" : 4 traits (2 montants + 2 diagonales), en coordonnées relatives.
  const stroke = size * 0.11;
  const xL = size * 0.24;
  const xR = size * 0.76;
  const yTop = size * 0.28;
  const yBot = size * 0.74;
  const xMid = size * 0.5;

  const distToSeg = (px, py, ax, ay, bx, by) => {
    const dx = bx - ax;
    const dy = by - ay;
    const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
    return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
  };

  const segments = [
    [xL, yTop, xL, yBot],
    [xR, yTop, xR, yBot],
    [xL, yTop, xMid, size * 0.56],
    [xMid, size * 0.56, xR, yTop],
  ];

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      if (!inRoundedRect(x, y)) {
        rgba[i + 3] = 0; // transparent hors coins arrondis
        continue;
      }
      // Fond dégradé vertical #1e2130 → #12141c.
      const t = y / size;
      let r = Math.round(0x1e + (0x12 - 0x1e) * t);
      let g = Math.round(0x21 + (0x14 - 0x21) * t);
      let b = Math.round(0x30 + (0x1c - 0x30) * t);

      // Le "M" en accent, avec liseré : distance au trait < stroke/2.
      let d = Infinity;
      for (const [ax, ay, bx, by] of segments) {
        d = Math.min(d, distToSeg(x + 0.5, y + 0.5, ax, ay, bx, by));
      }
      if (d < stroke / 2) {
        [r, g, b] = accent;
      } else if (d < stroke / 2 + size * 0.015) {
        // halo doux autour du trait
        r = Math.round(r * 0.7 + accent[0] * 0.3);
        g = Math.round(g * 0.7 + accent[1] * 0.3);
        b = Math.round(b * 0.7 + accent[2] * 0.3);
      }

      rgba[i] = r;
      rgba[i + 1] = g;
      rgba[i + 2] = b;
      rgba[i + 3] = 255;
    }
  }
  return encodePNG(size, size, rgba);
}

mkdirSync('public/icons', { recursive: true });
for (const size of [192, 512]) {
  writeFileSync(`public/icons/icon-${size}.png`, drawIcon(size));
  console.log(`icône générée : public/icons/icon-${size}.png`);
}
