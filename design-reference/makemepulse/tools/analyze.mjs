// Analysis of a record.mjs session: parallax per depth band (block matching with sharp),
// camera follow lag, transition timing, loader timeline, tween summary.
// usage: node analyze.mjs <width>
import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const W = +process.argv[2] || 1440;
const OUT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RAW = path.join(OUT, 'tools', 'raw');
const R = JSON.parse(fs.readFileSync(path.join(RAW, `results-${W}.json`), 'utf8'));
const S = 0.5; // analysis scale

async function gray(f) {
  const img = sharp(f); const m = await img.metadata();
  const w = Math.round(m.width * S), h = Math.round(m.height * S);
  const { data } = await img.resize(w, h).greyscale().raw().toBuffer({ resolveWithObject: true });
  return { w, h, d: data };
}
const patchStats = (g, x, y, n) => { let s = 0, s2 = 0; for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) { const v = g.d[(y + j) * g.w + x + i]; s += v; s2 += v * v; } const m = s / (n * n); return Math.sqrt(s2 / (n * n) - m * m); };
function match(A, B, x, y, n, rx, ry) {
  let best = 1e18, bx = 0, by = 0, second = 1e18;
  for (let dy = -ry; dy <= ry; dy++) for (let dx = -rx; dx <= rx; dx++) {
    const X = x + dx, Y = y + dy; if (X < 0 || Y < 0 || X + n > B.w || Y + n > B.h) continue;
    let sad = 0;
    for (let j = 0; j < n; j += 1) { const ra = (y + j) * A.w + x, rb = (Y + j) * B.w + X; for (let i = 0; i < n; i += 2) sad += Math.abs(A.d[ra + i] - B.d[rb + i]); }
    if (sad < best) { second = best; best = sad; bx = dx; by = dy; } else if (sad < second) second = sad;
  }
  return { dx: bx, dy: by, sad: best / (n * n / 2) };
}
const med = a => { const s = [...a].sort((p, q) => p - q); return s.length ? s[s.length >> 1] : null; };
// bands of the frame (fraction of height); in these painted 3D scenes, lower = nearer, upper = farther
const BANDS = { back_top_0_30: [0.04, 0.30], mid_35_60: [0.35, 0.60], fore_65_96: [0.65, 0.96] };
async function bandShifts(fa, fb) {
  const A = await gray(fa), B = await gray(fb); const n = 40, rx = 70, ry = 30; const out = {};
  for (const [name, [y0, y1]] of Object.entries(BANDS)) {
    const cands = [];
    for (let y = Math.round(A.h * y0); y + n < A.h * y1; y += n) for (let x = rx + 10; x + n + rx + 10 < A.w; x += n) cands.push({ x, y, sd: patchStats(A, x, y, n) });
    cands.sort((p, q) => q.sd - p.sd);
    const picks = cands.filter(c => c.sd > 12).slice(0, 14);
    const ms = picks.map(c => ({ ...c, ...match(A, B, c.x, c.y, n, rx, ry) })).filter(m => m.sad < 25);
    out[name] = { n: ms.length, dx: ms.length ? +(med(ms.map(m => m.dx)) / S).toFixed(1) : null, dy: ms.length ? +(med(ms.map(m => m.dy)) / S).toFixed(1) : null, dxs: ms.map(m => m.dx / S) };
  }
  return out;
}

// dense: every textured block in the frame, then 1-D k-means (k=3) on dx -> fore / mid / back clusters
async function denseShifts(fa, fb, axis = 'dx') {
  const A = await gray(fa), B = await gray(fb); const n = 32, rx = 75, ry = 35; const ms = [];
  for (let y = ry + 2; y + n + ry + 2 < A.h; y += n) for (let x = rx + 2; x + n + rx + 2 < A.w; x += n) {
    const sd = patchStats(A, x, y, n); if (sd < 14) continue;
    const m = match(A, B, x, y, n, rx, ry); if (m.sad < 22) ms.push({ x, y, v: m[axis] / S });
  }
  const vals = ms.map(m => m.v).sort((a, b) => a - b); const pct = p => vals[Math.min(vals.length - 1, Math.floor(p * vals.length))];
  let c = [pct(0.1), pct(0.5), pct(0.9)];
  for (let it = 0; it < 30; it++) { const g = [[], [], []]; for (const v of vals) { let bi = 0; for (let i = 1; i < 3; i++) if (Math.abs(v - c[i]) < Math.abs(v - c[bi])) bi = i; g[bi].push(v); } c = g.map((gg, i) => gg.length ? gg.reduce((a, b) => a + b, 0) / gg.length : c[i]); }
  const counts = [0, 0, 0]; const ys = [[], [], []]; for (const m of ms) { let bi = 0; for (let i = 1; i < 3; i++) if (Math.abs(m.v - c[i]) < Math.abs(m.v - c[bi])) bi = i; counts[bi]++; ys[bi].push(m.y / A.h); }
  return { blocks: ms.length, p10: pct(0.1), p50: pct(0.5), p90: pct(0.9), clusters: c.map((v, i) => ({ shift: +v.toFixed(1), blocks: counts[i], meanYfrac: ys[i].length ? +(ys[i].reduce((a, b) => a + b, 0) / ys[i].length).toFixed(2) : null })) };
}

function lagStats(lag, axis) {
  const s = lag.samples.filter(x => x.cam);
  const pre = s.filter(x => x.t < lag.tStep); const post = s.filter(x => x.t >= lag.tStep);
  if (pre.length < 2 || post.length < 10) return null;
  const v0 = pre[pre.length - 1].cam[axis], v1 = post[post.length - 1].cam[axis]; const D = v1 - v0;
  if (Math.abs(D) < 1e-4) return { note: 'no camera motion', v0, v1 };
  const firstMove = post.find(x => Math.abs(x.cam[axis] - v0) > Math.abs(D) * 0.01);
  const at = f => { const p = post.find(x => (x.cam[axis] - v0) / D >= f); return p ? p.t - (firstMove ? firstMove.t : lag.tStep) : null; };
  const dts = post.slice(1).map((x, i) => x.t - post[i].t); const frame = med(dts);
  const t63 = at(0.632), t95 = at(0.95);
  const k63 = t63 ? 1 - Math.pow(1 - 0.632, frame / t63) : null;
  const k95 = t95 ? 1 - Math.pow(0.05, frame / t95) : null;
  return { delta: +D.toFixed(4), startLatencyMs: firstMove ? +(firstMove.t - lag.tStep).toFixed(1) : null, t63ms: t63 && +t63.toFixed(0), t95ms: t95 && +t95.toFixed(0), frameMs: +frame.toFixed(2), lerpPerFrameFrom63: k63 && +k63.toFixed(4), lerpPerFrameFrom95: k95 && +k95.toFixed(4) };
}

const report = { viewport: R.viewport, chapters: [] };
for (const c of R.chapters) {
  const r = { idx: c.idx, id: c.id };
  r.wheel = { camMaxDev: c.wheel.camMaxDev, chapterAfter: c.wheel.chapterAfter, image: await bandShifts(c.wheel.before, c.wheel.after) };
  r.parallaxLR = await bandShifts(c.parallax.left, c.parallax.right);
  r.parallaxUD = await bandShifts(c.parallax.up, c.parallax.down);
  r.denseLR = await denseShifts(c.parallax.left, c.parallax.right, 'dx');
  r.denseUD = await denseShifts(c.parallax.up, c.parallax.down, 'dy');
  r.denseWheel = await denseShifts(c.wheel.before, c.wheel.after, 'dy');
  r.mouseSweepPx = { x: c.parallax.mouseRight[0] - c.parallax.mouseLeft[0], y: 0.8 * R.viewport[1] };
  r.lagX = lagStats(c.lag, 0); r.lagY = lagStats(c.lag2, 1); r.lagX2 = lagStats(c.lag2, 0);
  report.chapters.push(r);
}
// transitions
report.transitions = R.transitions.map(t => {
  const s = t.samples; const on = s.find(x => x.act >= 0); const off = on && s.slice(s.indexOf(on)).find(x => x.act < 0);
  const visChanges = []; for (let i = 1; i < s.length; i++) if (s[i].vis !== s[i - 1].vis || s[i].ch !== s[i - 1].ch) visChanges.push({ dt: +(s[i].t - t.tClick).toFixed(0), vis: s[i].vis, ch: s[i].ch });
  return { from: t.from, activeAfterClickMs: on ? +(on.t - t.tClick).toFixed(0) : null, activeDurationMs: on && off ? +(off.t - on.t).toFixed(0) : null, visChanges };
});
// loader
const L = R.loader; const t0 = L[0] && L[0].t;
report.loader = L.filter((x, i) => i === 0 || x.fg !== L[i - 1].fg || x.loaderCls !== L[i - 1].loaderCls || x.landingCls !== L[i - 1].landingCls).map(x => ({ dt: +(x.t - t0).toFixed(0), fg: x.fg, loader: x.loaderCls, landing: x.landingCls }));
// cursor
if (R.cursor) { const s = R.cursor.samples; report.cursor = s.filter((x, i) => i === 0 || x.tr !== s[i - 1].tr).slice(0, 12).map(x => ({ dt: +(x.t - R.cursor.t).toFixed(1), tr: x.tr })); }
// tweens
const tw = R.tweens; const groups = {};
for (const t of tw) { if (t.method === 'delayedCall') continue; const k = `${t.target} | ${t.duration}s | ${t.ease && t.ease.name} | delay ${t.delay}`; groups[k] = groups[k] || { n: 0, vars: t.vars && Object.keys(t.vars).join(','), samples: t.ease && t.ease.samples, firstT: t.t }; groups[k].n++; }
report.tweenGroups = groups;
report.delayedCalls = tw.filter(t => t.method === 'delayedCall').map(t => t.delay);
report.marks = R.marks;
fs.writeFileSync(path.join(RAW, `analysis-${W}.json`), JSON.stringify(report, null, 1));
console.log(JSON.stringify(report, (k, v) => (k === 'dxs' ? undefined : v), 1));
