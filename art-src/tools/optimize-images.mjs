// Task 3 B1: makes the images the app serves smaller without changing how
// they look. Each lossy WebP / JPEG under public/ is re-encoded in place
// (same name, same format: nothing that refers to it changes) at libwebp's
// or mozjpeg's highest effort, at the lowest quality whose result still
// matches the file as served today:
//   - SSIM (luma, 8x8 windows) >= 0.98, and on alpha too where there is one
//   - "strict" art (dark or smooth: night skies, gradients, where banding
//     shows) needs SSIM >= 0.99 and no 16x16 block whose mean luma moved
//     more than 2 levels; everything else no block past 5 levels
// and only if it is at least 10% smaller. Lossless WebP and PNG are data or
// exact colour (heightmaps, masks, particle samples, Minimal's #121212
// plates) - they are only ever re-packed losslessly (pixels identical).
//   node optimize-images.mjs <publicDir> <report.json> [--write] [--only substr]
import { readdirSync, statSync, readFileSync, writeFileSync } from 'node:fs';
import { join, extname } from 'node:path';
import sharp from 'sharp';

const [DIR, REPORT] = process.argv.slice(2);
const WRITE = process.argv.includes('--write');
const ONLY = process.argv.includes('--only') ? process.argv[process.argv.indexOf('--only') + 1] : '';
const SKIPS = process.argv.includes('--skip') ? process.argv[process.argv.indexOf('--skip') + 1] : '';
const SKIP = [/^mediapipe\//, /^motivator\/videos\/.*\.mp4$/, /favicon|apple-touch/,
  // data, not pictures: read by code or WebGL pixel by pixel
  /^story\/terrain\.png$/, /^story\/glitch-gradient\.png$/, /^map\/roads\.png$/, /-sample\.png$/];
// exact colour: Minimal's plates meet its paper (#fefefe / #121212) with no seam - lossless re-pack only
const EXACT = /^menu\/minimal\//;
// night skies, backdrops and the painted scenes: banding would show - always strict
const STRICT = /sky\/|night|dark|bg-|^intro\/|^story\/|^menu\/|^lodge\/|^account\/|^plan\/|^map\//;

function walk(d, base = '') {
  return readdirSync(d, { withFileTypes: true }).flatMap((e) => {
    const rel = base ? `${base}/${e.name}` : e.name;
    if (e.isDirectory() || e.isSymbolicLink()) { try { return statSync(join(d, e.name)).isDirectory() ? walk(join(d, e.name), rel) : [rel]; } catch { return []; } }
    return [rel];
  });
}

async function raw(buf) {
  const { data, info } = await sharp(buf).raw().toBuffer({ resolveWithObject: true });
  return { data, w: info.width, h: info.height, c: info.channels };
}
const lumaOf = ({ data, w, h, c }) => {
  const y = new Float32Array(w * h), a = new Float32Array(w * h);
  for (let i = 0, p = 0; i < y.length; i++, p += c) {
    const al = c === 4 ? data[p + 3] / 255 : 1;
    y[i] = (0.299 * data[p] + 0.587 * data[p + 1] + 0.114 * data[p + 2]) * al; // over black
    a[i] = c === 4 ? data[p + 3] : 255;
  }
  return { y, a };
};
function ssim(A, B, w, h, step = 4) {
  const C1 = (0.01 * 255) ** 2, C2 = (0.03 * 255) ** 2;
  let sum = 0, n = 0;
  for (let by = 0; by + 8 <= h; by += step) for (let bx = 0; bx + 8 <= w; bx += step) {
    let ma = 0, mb = 0;
    for (let y = by; y < by + 8; y++) for (let x = bx; x < bx + 8; x++) { ma += A[y * w + x]; mb += B[y * w + x]; }
    ma /= 64; mb /= 64;
    let va = 0, vb = 0, cv = 0;
    for (let y = by; y < by + 8; y++) for (let x = bx; x < bx + 8; x++) { const da = A[y * w + x] - ma, db = B[y * w + x] - mb; va += da * da; vb += db * db; cv += da * db; }
    va /= 63; vb /= 63; cv /= 63;
    sum += ((2 * ma * mb + C1) * (2 * cv + C2)) / ((ma * ma + mb * mb + C1) * (va + vb + C2)); n++;
  }
  return n ? sum / n : 1;
}
function blockShift(A, B, w, h) {
  let worst = 0;
  for (let by = 0; by + 16 <= h; by += 16) for (let bx = 0; bx + 16 <= w; bx += 16) {
    let d = 0;
    for (let y = by; y < by + 16; y++) for (let x = bx; x < bx + 16; x++) d += B[y * w + x] - A[y * w + x];
    worst = Math.max(worst, Math.abs(d / 256));
  }
  return worst;
}
// dark (mean luma < 70) or smooth (little local detail) art is "strict"
function strictness({ y }, w, h) {
  let mean = 0; for (const v of y) mean += v; mean /= y.length;
  let grad = 0, n = 0;
  for (let i = 0; i < y.length - w - 1; i += 7) { grad += Math.abs(y[i + 1] - y[i]) + Math.abs(y[i + w] - y[i]); n++; }
  return mean < 70 || grad / n < 3;
}

const files = walk(DIR).filter((f) => !SKIP.some((r) => r.test(f)) && /\.(webp|jpe?g|png)$/i.test(f) && (!ONLY || f.includes(ONLY)) && (!SKIPS || !f.includes(SKIPS)));
const out = [];
let before = 0, after = 0;
for (const rel of files) {
  const path = join(DIR, rel);
  const src = readFileSync(path);
  const ext = extname(rel).toLowerCase();
  const meta = await sharp(src).metadata();
  // PNGs, masks and exact-colour plates are only ever re-packed losslessly; a
  // lossless WebP that is a picture may go lossy, but only under the strict
  // rule and for a real saving (30%), else it is re-packed too
  const losslessWebp = ext === '.webp' && await isLosslessWebp(src);
  const repackOnly = ext === '.png' || EXACT.test(rel) || /mask/.test(rel);
  const entry = { file: rel, kb: Math.round(src.length / 1024), w: meta.width, h: meta.height };
  before += src.length;
  let best = null;
  try {
    const repack = async () => {
      // identical pixels or nothing
      const cand = ext === '.png'
        ? await sharp(src).png({ compressionLevel: 9, effort: 10, palette: false }).toBuffer()
        : await sharp(src).webp({ lossless: true, effort: 6, quality: 100, exact: true }).toBuffer();
      const [a, b] = [await raw(src), await raw(cand)];
      entry.kind = 'lossless';
      return a.data.equals(b.data) && cand.length < src.length * 0.97 ? { buf: cand, q: 'lossless' } : null;
    };
    if (repackOnly) best = await repack();
    else {
      const ref = await raw(src);
      const L = lumaOf(ref);
      const strict = losslessWebp || STRICT.test(rel) || strictness(L, ref.w, ref.h);
      const hasAlpha = meta.hasAlpha;
      entry.kind = strict ? 'strict' : 'normal';
      // binary search the lowest quality that passes, from 60 to 92
      let lo = 60, hi = 92;
      // encode from the decoded pixels (no decode per try); search at effort 4,
      // then the chosen quality at effort 6 is checked again in full
      const pixels = () => sharp(ref.data, { raw: { width: ref.w, height: ref.h, channels: ref.c } });
      const enc = (q, effort = 4) => ext === '.webp'
        ? pixels().webp({ quality: q, effort, smartSubsample: true, alphaQuality: 100, ...(hasAlpha ? { exact: true } : {}) }).toBuffer()
        : pixels().jpeg({ quality: q, mozjpeg: true }).toBuffer();
      const check = async (buf, step = 8) => {
        const c = await raw(buf); const M = lumaOf(c);
        const s = ssim(L.y, M.y, ref.w, ref.h, step);
        const sa = hasAlpha ? ssim(L.a, M.a, ref.w, ref.h, step) : 1;
        const shift = blockShift(L.y, M.y, ref.w, ref.h);
        return { s, sa, shift, ok: s >= (strict ? 0.99 : 0.98) && sa >= 0.99 && shift <= (strict ? 2 : 5) };
      };
      while (lo < hi) {
        const mid = Math.floor((lo + hi) / 2);
        const buf = await enc(mid);
        const r = await check(buf);
        if (r.ok && buf.length < src.length) { hi = mid; best = { buf, q: mid, ...r }; } else lo = mid + 1;
      }
      best = null;
      for (let q = lo; q <= 92 && !best; q += 2) { const buf = await enc(q, 6); const r = await check(buf, 4); if (r.ok) best = { buf, q, ...r }; }
      if (best && best.buf.length > src.length * (losslessWebp ? 0.7 : 0.9)) best = null;
      if (best && losslessWebp) entry.kind = 'lossless->lossy (strict)';
      if (!best && losslessWebp) best = await repack();
    }
  } catch (e) { entry.error = e.message; }
  if (best) {
    entry.newKb = Math.round(best.buf.length / 1024); entry.q = best.q;
    if (best.s) Object.assign(entry, { ssim: +best.s.toFixed(4), ssimAlpha: +best.sa.toFixed(4), blockShift: +best.shift.toFixed(2) });
    after += best.buf.length;
    if (WRITE) writeFileSync(path, best.buf);
  } else after += src.length;
  out.push(entry);
  if (best) console.log(`${rel}  ${entry.kb} -> ${entry.newKb} KB  q${entry.q}  ${entry.kind}${best.s ? `  ssim ${entry.ssim}  shift ${entry.blockShift}` : ''}`);
}
writeFileSync(REPORT, JSON.stringify({ before, after, files: out }, null, 1));
console.log(`\n${files.length} images: ${Math.round(before / 1024)} KB -> ${Math.round(after / 1024)} KB (${WRITE ? 'written' : 'dry run'})`);

async function isLosslessWebp(buf) {
  // RIFF....WEBP then VP8L (lossless) / VP8X with a VP8L chunk inside
  const s = buf.subarray(0, Math.min(buf.length, 4096)).toString('latin1');
  return s.includes('VP8L') && !s.includes('VP8 ');
}
