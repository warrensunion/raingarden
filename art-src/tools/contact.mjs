// Contact sheet of art-src/gen images matching a prefix, for reviewing a batch at a glance.
// usage: node art-src/tools/contact.mjs <prefix> <out.png> [cols=3] [w=640]
import sharp from 'sharp';
import fs from 'node:fs';
const [prefix, out, cols = 3, w = 640] = process.argv.slice(2);
const files = fs.readdirSync('art-src/gen').filter((f) => f.startsWith(prefix) && f.endsWith('.png')).sort();
const W = Number(w), C = Number(cols), H = Math.round(W * 2 / 3);
const tiles = await Promise.all(files.map((f) => sharp(`art-src/gen/${f}`).flatten({ background: '#808890' }).resize(W, H, { fit: 'contain', background: '#808890' }).png().toBuffer()));
const rows = Math.ceil(files.length / C);
await sharp({ create: { width: W * C, height: H * rows, channels: 3, background: '#222' } })
  .composite(tiles.map((input, i) => ({ input, left: (i % C) * W, top: Math.floor(i / C) * H })))
  .png().toFile(out);
console.log(files.join(' '));
