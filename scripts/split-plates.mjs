#!/usr/bin/env node
/**
 * Splits each story plate into a far layer and a near cut-out along a traced skyline.
 *
 * Why: a single painted plate can only slide as one card, which reads as a
 * photo, not a place. Cutting the subject (house, bank, garden bed) out along
 * a hand-traced polygon and putting it at the pivot depth (z = 1) while the
 * rest sits at z = 3 gives the true two-plane parallax the reference gets
 * from 3D. The far layer has the cut region filled by multi-scale normalised
 * convolution (blur(img*m)/blur(m)), so the few pixels the near layer uncovers
 * as it moves show smeared sky and trees, not a ghost of the subject.
 * Both outputs keep the plate's exact size, so the story positions them with
 * the plate's own object-fit maths and they line up by construction.
 *
 * Polygons are in percent of the plate (x, y), traced on a 5 % grid
 * (see docs/reports/story-report.md). Run: node scripts/split-plates.mjs
 */
import sharp from 'sharp';
import { mkdir } from 'node:fs/promises';

const POLYS = {
  roof: [[100, 9], [96, 9], [96, 4], [87, 4], [87, 19], [83, 22], [75, 29], [66, 36], [58, 44], [53, 50], [53, 58], [66, 59], [66, 73], [58, 75], [52, 82], [47, 92], [46, 100], [100, 100]],
  drive: [[100, 36], [94, 41], [88, 46], [80, 46], [76, 52], [74, 60], [79, 65], [86, 67], [84, 73], [76, 78], [64, 83], [62, 88], [70, 91], [100, 96]],
  drain: [[54, 0], [100, 0], [100, 63], [93, 59], [86, 54], [79, 50], [70, 45], [61, 39], [54, 34], [50, 30], [52, 20]],
  creek: [[88, 1], [100, 0], [100, 100], [86, 100], [80, 82], [74, 66], [70, 59], [64, 55], [55, 52], [48, 50], [52, 43], [58, 34], [64, 27], [71, 21], [79, 12]],
  garden: [[0, 66], [9, 64], [17, 66], [24, 62], [30, 58], [37, 55], [39, 42], [42, 29], [47, 31], [53, 36], [58, 31], [62, 33], [66, 28], [69, 22], [71, 12], [70, 4], [71, 0], [100, 0], [100, 100], [0, 100]],
  stream: [[71, 0], [100, 0], [100, 100], [22, 100], [25, 90], [34, 83], [39, 76], [36, 70], [42, 62], [54, 56], [60, 50], [66, 45], [72, 40], [75, 30], [70, 15]],
};

const SRC = 'public/art';
const OUT = 'public/art/story';

async function maskFor(name, w, h, featherPx, dilatePx = 0) {
  const pts = POLYS[name].map(([x, y]) => `${(x / 100) * w},${(y / 100) * h}`).join(' ');
  const stroke = dilatePx ? `stroke="#fff" stroke-width="${dilatePx * 2}" stroke-linejoin="round"` : '';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="100%" height="100%" fill="#000"/><polygon points="${pts}" fill="#fff" ${stroke}/></svg>`;
  let img = sharp(Buffer.from(svg)).greyscale();
  if (featherPx) img = img.blur(featherPx);
  const { data } = await img.raw().toBuffer({ resolveWithObject: true });
  // SVG rasterises to 1 channel after greyscale(); keep the first channel only.
  const ch = data.length / (w * h);
  const m = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) m[i] = data[i * ch] / 255;
  return m;
}

/** Box blur of radius r along rows (stride 1) or columns (stride w), in place via a scratch line. */
function boxPass(src, dst, w, h, r, horizontal) {
  const n = horizontal ? w : h, lines = horizontal ? h : w;
  const step = horizontal ? 1 : w, lineStep = horizontal ? w : 1;
  const inv = 1 / (2 * r + 1);
  for (let l = 0; l < lines; l++) {
    const base = l * lineStep;
    let acc = 0;
    for (let k = -r; k <= r; k++) acc += src[base + Math.min(n - 1, Math.max(0, k)) * step];
    for (let i = 0; i < n; i++) {
      dst[base + i * step] = acc * inv;
      const add = Math.min(n - 1, i + r + 1), sub = Math.max(0, i - r);
      acc += src[base + add * step] - src[base + sub * step];
    }
  }
}

/** Approximate Gaussian blur (three box passes each way; sigma^2 = 3 r(r+1)/3). */
function blurPlane(plane, w, h, sigma) {
  const r = Math.max(1, Math.round(Math.sqrt(sigma * sigma + 1) - 0.5));
  let a = Float32Array.from(plane), b = new Float32Array(w * h);
  for (let k = 0; k < 3; k++) {
    boxPass(a, b, w, h, r, true);
    boxPass(b, a, w, h, r, false);
  }
  return a;
}

async function split(name) {
  const src = `${SRC}/plate-${name}.webp`;
  const { data: rgb, info } = await sharp(src).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h } = info;

  // Near cut-out: plate colour, grown 9 px with a 3 px soft edge, so it covers the far layer's filled seam.
  const soft = await maskFor(name, w, h, 3, 9);
  const rgba = Buffer.alloc(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    rgba[i * 4] = rgb[i * 3];
    rgba[i * 4 + 1] = rgb[i * 3 + 1];
    rgba[i * 4 + 2] = rgb[i * 3 + 2];
    rgba[i * 4 + 3] = Math.round(soft[i] * 255);
  }
  await sharp(rgba, { raw: { width: w, height: h, channels: 4 } }).webp({ quality: 82, alphaQuality: 90, effort: 6 }).toFile(`${OUT}/plate-${name}-near.webp`);

  // Far layer: hole = polygon grown by 5 px (inside the near layer's opaque edge), filled.
  const hole = await maskFor(name, w, h, 0, 5);
  const keep = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) keep[i] = hole[i] > 0.5 ? 0 : 1;

  const filled = new Float32Array(w * h * 3);
  const done = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) if (keep[i]) {
    done[i] = 1;
    for (let c = 0; c < 3; c++) filled[i * 3 + c] = rgb[i * 3 + c] / 255;
  }
  // Small sigmas first: pixels near the edge take the closest colours.
  for (const sigma of [4, 10, 24, 60, 150, 400, 1200]) {
    const mb = blurPlane(keep, w, h, sigma);
    const chans = [];
    for (let c = 0; c < 3; c++) {
      const p = new Float32Array(w * h);
      for (let i = 0; i < w * h; i++) p[i] = keep[i] * (rgb[i * 3 + c] / 255);
      chans.push(blurPlane(p, w, h, sigma));
    }
    for (let i = 0; i < w * h; i++) {
      if (done[i] || mb[i] < 1e-4) continue;
      for (let c = 0; c < 3; c++) filled[i * 3 + c] = chans[c][i] / mb[i];
      done[i] = 1;
    }
  }
  const out = Buffer.alloc(w * h * 3);
  for (let i = 0; i < w * h * 3; i++) out[i] = Math.round(Math.min(1, filled[i]) * 255);
  await sharp(out, { raw: { width: w, height: h, channels: 3 } }).webp({ quality: 80, effort: 6 }).toFile(`${OUT}/plate-${name}-far.webp`);
  console.log('split', name, w + 'x' + h);
}

await mkdir(OUT, { recursive: true });
const only = process.argv[2];
for (const name of Object.keys(POLYS)) if (!only || only === name) await split(name);
