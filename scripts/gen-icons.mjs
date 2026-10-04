// Génère les icônes PNG de la PWA (anneau 3/4, comme favicon.svg) sans dépendance.
import { writeFileSync } from 'node:fs';
import { crc32, deflateSync } from 'node:zlib';

const BG = [0x0b, 0x0b, 0x0c];
const TRACK = [0x2a, 0x2a, 0x2e];
const ACCENT = [0xff, 0x8a, 0x3d];
const SUPERSAMPLE = 4;

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function encodePng(size, pixels) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bits par canal
  ihdr[9] = 2; // RGB
  const stride = size * 3 + 1;
  const raw = Buffer.alloc(size * stride);
  for (let y = 0; y < size; y++) {
    raw[y * stride] = 0; // filtre « none »
    pixels.copy(raw, y * stride + 1, y * size * 3, (y + 1) * size * 3);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** Couleur d'un point en coordonnées normalisées 0..1. */
function colorAt(x, y, { ringRadius, thickness }) {
  const dx = x - 0.5;
  const dy = y - 0.5;
  if (Math.abs(Math.hypot(dx, dy) - ringRadius) > thickness / 2) return BG;
  // Angle depuis midi, sens horaire : l'arc accent couvre 270°.
  const angle = (Math.atan2(dx, -dy) + 2 * Math.PI) % (2 * Math.PI);
  return angle <= 1.5 * Math.PI ? ACCENT : TRACK;
}

function render(size, ring) {
  const pixels = Buffer.alloc(size * size * 3);
  const n = SUPERSAMPLE;
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      const acc = [0, 0, 0];
      for (let sy = 0; sy < n; sy++) {
        for (let sx = 0; sx < n; sx++) {
          const c = colorAt((px + (sx + 0.5) / n) / size, (py + (sy + 0.5) / n) / size, ring);
          for (let k = 0; k < 3; k++) acc[k] += c[k];
        }
      }
      const i = (py * size + px) * 3;
      for (let k = 0; k < 3; k++) pixels[i + k] = Math.round(acc[k] / (n * n));
    }
  }
  return encodePng(size, pixels);
}

const STANDARD = { ringRadius: 0.28, thickness: 0.11 };
// Maskable : la zone sûre est le cercle central de 80 %, l'anneau reste bien dedans.
const MASKABLE = { ringRadius: 0.2, thickness: 0.08 };

const outputs = [
  ['public/pwa-192.png', 192, STANDARD],
  ['public/pwa-512.png', 512, STANDARD],
  ['public/maskable-512.png', 512, MASKABLE],
  ['public/apple-touch-icon.png', 180, STANDARD],
];

for (const [file, size, ring] of outputs) {
  writeFileSync(file, render(size, ring));
  console.log(`ok ${file}`);
}
