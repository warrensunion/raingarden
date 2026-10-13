/**
 * Dev page for the yard renderer (served by `npx vite` at /dev/yard.html).
 *
 * WHY: the renderer has to be judged by eye and measured in a real browser
 * before the designer (Task 13) exists. This builds a synthetic 128² yard
 * (a gentle slope with shallow swales and a bowl), fakes a storm — a puddle
 * filling the bowl, runoff gathering into streams, the bowl overflowing
 * downhill, the garden ponding — and exposes window.demo for scripts/
 * verify-yard.mjs. `?t=12` freezes the storm clock for repeatable shots;
 * `?static=1` forces the Canvas2D fallback.
 */

import { createYard } from '../src/render/index.js';

const N = 128;
const CELL = 0.12;
const qs = new URLSearchParams(location.search);

// ---------- synthetic terrain ----------
function makeTerrain() {
  const z = new Float64Array(N * N);
  for (let iy = 0; iy < N; iy++) {
    for (let ix = 0; ix < N; ix++) {
      const x = ix * CELL;
      const y = iy * CELL;
      let h = 0.045 * y + 0.012 * x;                       // rises away from the house
      h += 0.09 * Math.sin(0.42 * x + 0.15 * y);            // shallow swales
      h += 0.03 * Math.sin(1.3 * x - 0.7 * y) * Math.cos(0.9 * y);
      const bx = x - 10.5;
      const by = y - 6.5;
      h -= 0.32 * Math.exp(-(bx * bx + by * by) / (2 * 1.3 * 1.3)); // the bowl
      z[iy * N + ix] = h;
    }
  }
  return { nx: N, ny: N, cell: CELL, z };
}

const terrain = makeTerrain();
const { z } = terrain;

// D8 steepest-descent directions + flow accumulation (demo only; the real sim is Task 3)
const down = new Int32Array(N * N).fill(-1);
for (let iy = 0; iy < N; iy++) {
  for (let ix = 0; ix < N; ix++) {
    const i = iy * N + ix;
    let best = 0;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const jx = ix + dx;
        const jy = iy + dy;
        if (jx < 0 || jy < 0 || jx >= N || jy >= N) continue;
        const s = (z[i] - z[jy * N + jx]) / Math.hypot(dx, dy);
        if (s > best) { best = s; down[i] = jy * N + jx; }
      }
    }
  }
}
const order = Array.from({ length: N * N }, (_, i) => i).sort((a, b) => z[b] - z[a]);
const acc = new Float32Array(N * N).fill(1);
const SPOUT = [2.6, 13.2];
const spoutCell = Math.round(SPOUT[1] / CELL) * N + Math.round(SPOUT[0] / CELL);
acc[spoutCell] += 900;
for (const i of order) if (down[i] >= 0) acc[down[i]] += acc[i];

// the bowl: its lowest cell, its spill level and its overflow path
let bottom = 0;
for (let i = 0; i < N * N; i++) {
  const x = (i % N) * CELL - 10.5;
  const y = Math.floor(i / N) * CELL - 6.5;
  if (x * x + y * y < 4 && z[i] < z[bottom]) bottom = i;
}
let spill = Infinity;
let spillCell = bottom;
for (let i = 0; i < N * N; i++) {
  const x = (i % N) * CELL - 10.5;
  const y = Math.floor(i / N) * CELL - 6.5;
  const r = Math.hypot(x, y);
  if (r > 2.3 && r < 2.5 && z[i] < spill) { spill = z[i]; spillCell = i; }
}
const overflow = [];
for (let i = spillCell, k = 0; i >= 0 && k < 400; i = down[i], k++) overflow.push(i);

const GARDEN = { cx: 4.6, cy: 4.4, lenM: 3.4, widM: 2.0, rot: 0.35, depthM: 0.2, bermM: 0.08 };
const PLANT_IDS = [
  ['slough-sedge', 'sedge'], ['dagger-leaf-rush', 'rush'], ['lady-fern', 'fern'], ['red-twig-dogwood', 'shrub'],
  ['douglas-spirea', 'shrub'], ['deer-fern', 'fern'], ['taper-tipped-rush', 'rush'], ['black-twinberry', 'shrub'],
];
function makePlants(g) {
  const out = [];
  const c = Math.cos(g.rot);
  const s = Math.sin(g.rot);
  const rings = [[0, 1], [0.45, 4], [0.8, 7]];
  let k = 0;
  for (const [f, count] of rings) {
    for (let j = 0; j < count; j++) {
      const a = (j / count) * Math.PI * 2 + f;
      const lx = Math.cos(a) * f * g.lenM / 2;
      const ly = Math.sin(a) * f * g.widM / 2;
      const [id, form] = PLANT_IDS[k++ % PLANT_IDS.length];
      out.push({ x: g.cx + lx * c - ly * s, y: g.cy + lx * s + ly * c, r: form === 'shrub' ? 0.5 : 0.32, id, form });
    }
  }
  return out;
}

function inGarden(x, y, g) {
  const dx = x - g.cx;
  const dy = y - g.cy;
  const c = Math.cos(g.rot);
  const s = Math.sin(g.rot);
  const lx = (dx * c + dy * s) / (g.lenM / 2);
  const ly = (-dx * s + dy * c) / (g.widM / 2);
  return Math.hypot(lx, ly);
}

// ---------- fake storm ----------
const STORM_S = 24;
function storm(t, out, { withGarden }) {
  const p = Math.min(1, t / STORM_S);
  const rain = Math.sin(Math.PI * Math.min(1, t / (STORM_S * 0.8)));     // intensity 0..1..0
  out.fill(0);
  // runoff gathering into streams
  const thr = 260 - 200 * Math.min(1, p * 1.6);
  for (let i = 0; i < N * N; i++) {
    if (acc[i] > thr) out[i] = Math.min(0.05, 0.0025 * Math.pow(acc[i] / thr, 0.55)) * (0.4 + 0.6 * rain);
  }
  // the bowl fills to its spill level, then overflows downhill
  const level = z[bottom] + (spill - z[bottom] + 0.01) * Math.min(1, p * 1.5);
  for (let i = 0; i < N * N; i++) {
    const x = (i % N) * CELL - 10.5;
    const y = Math.floor(i / N) * CELL - 6.5;
    if (x * x + y * y < 2.6 * 2.6 && level > z[i]) out[i] = Math.max(out[i], level - z[i]);
  }
  if (p * 1.5 > 1) {
    const front = Math.min(overflow.length, Math.floor((p * 1.5 - 1) * 3 * overflow.length));
    for (let k = 0; k < front; k++) {
      const i = overflow[k];
      const ix = i % N;
      const iy = Math.floor(i / N);
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          const jx = ix + dx;
          const jy = iy + dy;
          if (jx < 0 || jy < 0 || jx >= N || jy >= N) continue;
          const w = Math.exp(-(dx * dx + dy * dy) / 2.2);
          const j = jy * N + jx;
          out[j] = Math.max(out[j], 0.035 * w * (0.5 + 0.5 * rain));
        }
      }
    }
  }
  // the garden captures the roof water: it ponds and the streams below it stop
  if (withGarden) {
    for (let i = 0; i < N * N; i++) {
      const x = (i % N) * CELL;
      const y = Math.floor(i / N) * CELL;
      const r = inGarden(x, y, GARDEN);
      if (r < 0.9) out[i] = Math.max(out[i], 0.11 * Math.min(1, p * 2) * Math.min(1, (0.9 - r) * 6));
      else if (y < GARDEN.cy && Math.abs(x - GARDEN.cx) < 2.2) out[i] *= 0.25;
    }
  }
  return 4 + 36 * rain;  // mm/h
}

// ---------- tiny marching squares for the demo contours (the real one is Task 7) ----------
function contours(interval) {
  let lo = Infinity;
  let hi = -Infinity;
  for (const v of z) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
  const levels = [];
  for (let L = Math.ceil(lo / interval) * interval; L < hi; L += interval) {
    const segs = [];
    for (let iy = 0; iy < N - 1; iy++) {
      for (let ix = 0; ix < N - 1; ix++) {
        const c = [[ix, iy], [ix + 1, iy], [ix + 1, iy + 1], [ix, iy + 1]];
        const v = c.map(([a, b]) => z[b * N + a] - L);
        const pts = [];
        for (let e = 0; e < 4; e++) {
          const a = v[e];
          const b = v[(e + 1) % 4];
          if ((a < 0) !== (b < 0)) {
            const t = a / (a - b);
            const p0 = c[e];
            const p1 = c[(e + 1) % 4];
            pts.push((p0[0] + (p1[0] - p0[0]) * t) * CELL, (p0[1] + (p1[1] - p0[1]) * t) * CELL);
          }
        }
        if (pts.length >= 4) segs.push(...pts.slice(0, 4));
      }
    }
    levels.push({ level: L, segs: new Float32Array(segs) });
  }
  return levels;
}

// ---------- a painted stand-in for the user's photo (planar, top = far) ----------
function fakePhoto() {
  const S = 1024;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  g.fillStyle = '#5F7A4A';
  g.fillRect(0, 0, S, S);
  let seed = 42;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 9000; i++) {
    g.globalAlpha = 0.06 + rnd() * 0.12;
    g.fillStyle = ['#9DB873', '#5F7A4A', '#3E4A59', '#B9824F'][i % 7 === 0 ? 3 : i % 3];
    g.beginPath();
    g.ellipse(rnd() * S, rnd() * S, 3 + rnd() * 14, 2 + rnd() * 6, rnd() * 3, 0, Math.PI * 2);
    g.fill();
  }
  g.globalAlpha = 1;
  const px = (x) => (x / ((N - 1) * CELL)) * S;
  const py = (y) => (1 - y / ((N - 1) * CELL)) * S;
  // patio by the house
  g.fillStyle = '#ECE6DA';
  for (let r = 0; r < 4; r++) {
    for (let k = 0; k < 9; k++) {
      g.globalAlpha = 0.75 + rnd() * 0.2;
      g.fillRect(px(0.6 + k * 0.78) + 2, py(14.4 - r * 0.62), px(0.74) - 4, px(0.58) - 4);
    }
  }
  // stepping-stone path across the lawn, through the bowl
  for (let k = 0; k < 16; k++) {
    const t = k / 15;
    const x = 2 + t * 11 + Math.sin(t * 5) * 0.8;
    const y = 12 - t * 10;
    g.globalAlpha = 0.9;
    g.fillStyle = k % 2 ? '#7D8FA3' : '#ECE6DA';
    g.beginPath();
    g.ellipse(px(x), py(y), px(0.28), px(0.2), t * 2, 0, Math.PI * 2);
    g.fill();
  }
  // a bed of marigold flowers along the right fence
  for (let i = 0; i < 160; i++) {
    g.globalAlpha = 0.8;
    g.fillStyle = i % 4 ? '#E8B04A' : '#B9824F';
    g.beginPath();
    g.arc(px(14.2 + rnd() * 0.8), py(1 + rnd() * 9), 3 + rnd() * 4, 0, Math.PI * 2);
    g.fill();
  }
  g.globalAlpha = 1;
  return c;
}

// ---------- boot ----------
const canvas = document.getElementById('yard');
const hud = document.getElementById('hud');
const usePhoto = qs.get('photo') !== '0';
const WM = (N - 1) * CELL;
const api = await createYard(canvas, {
  terrain,
  photo: usePhoto ? fakePhoto() : null,
  toImage: usePhoto ? ([x, y]) => [x / WM, 1 - y / WM] : null,
  reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
});

const W = (N - 1) * CELL;
api.setMarks([
  { kind: 'downspout', pts: [SPOUT] },
  { kind: 'wall', pts: [[0.4, 14.6], [7.5, 14.6]] },
  { kind: 'outlet', pts: [[overflow[overflow.length - 1] % N * CELL, Math.floor(overflow[overflow.length - 1] / N) * CELL]] },
  { kind: 'septic', pts: [[11, 11.5], [14, 11.5], [14, 13.8], [11, 13.8]] },
  { kind: 'scale', pts: [[1, 0.8], [4, 0.8]] },
]);
const plants = makePlants(GARDEN);
api.setGarden(GARDEN, plants, { season: 1 });
let showContours = qs.get('contours') === '1';
api.setContours(showContours ? contours(0.1) : null);

const depth = new Float32Array(N * N);
const before = new Float32Array(N * N);
const frozen = qs.has('t') ? Number(qs.get('t')) : null;
let raining = true;
let t0 = performance.now();
function tick(now) {
  const t = frozen !== null ? frozen : ((now - t0) / 1000) % (STORM_S + 6);
  const mmH = storm(t, depth, { withGarden: true });
  api.setWater(depth, { rainMmH: raining ? mmH : 0 });
  if (splitOn) {
    storm(t, before, { withGarden: false });
    api.setSplit(Number(slider.value), before);
  }
  hud.textContent = `${api.kind} · t ${t.toFixed(1)} s · ${mmH.toFixed(0)} mm/h · ${api.fps().toFixed(0)} fps`;
  if (frozen === null || !window.demo.stopped) requestAnimationFrame(tick);
}

const poses = ['capture', 'mark', 'storm', 'optimize', 'plants', 'compare', 'plan'];
const posesEl = document.getElementById('poses');
for (const p of poses) {
  const b = document.createElement('button');
  b.textContent = p;
  b.dataset.pose = p;
  b.onclick = () => {
    api.cameraTo(p, 1400);
    for (const x of posesEl.children) x.setAttribute('aria-pressed', String(x === b));
  };
  posesEl.append(b);
}
let splitOn = false;
const slider = document.getElementById('split');
const splitBtn = document.getElementById('splitBtn');
splitBtn.onclick = () => {
  splitOn = !splitOn;
  splitBtn.setAttribute('aria-pressed', String(splitOn));
  if (!splitOn) api.setSplit(null);
};
document.getElementById('rain').onclick = (e) => {
  raining = !raining;
  e.target.setAttribute('aria-pressed', String(raining));
};
(api.canvas || canvas).addEventListener('pointerdown', (e) => {
  if (e.target.closest && e.target.closest('#ui')) return;
  const p = api.pick(e.clientX, e.clientY);
  console.log('pick', p && p.map((v) => v.toFixed(2)).join(', '));
  window.demo.lastPick = p;
});

window.demo = {
  api,
  W,
  stopped: false,
  setSplit(x) {
    splitOn = x !== null;
    if (x !== null) slider.value = String(x);
    splitBtn.setAttribute('aria-pressed', String(splitOn));
    if (!splitOn) api.setSplit(null);
  },
  setContours(on) { showContours = on; api.setContours(on ? contours(0.1) : null); },
  restart() { t0 = performance.now(); },
};
requestAnimationFrame(tick);
window.demo.ready = true;
