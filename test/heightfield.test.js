import test from 'node:test';
import assert from 'node:assert/strict';
import { toHeightfield } from '../src/depth/heightfield.js';

/*
 * Synthetic scene: a pinhole camera (65 deg vertical FOV, x right / y down /
 * z forward) at height H above a tilted ground plane Z = gx*X + gy*Y (world:
 * X right, Y forward, Z up), optionally with a vertical house wall at Y = wallY.
 * We render z-depth per pixel, turn it into inverse depth and then hide it
 * behind an unknown affine (s, t) the way Depth Anything does: d = (1/z - t) / s.
 */
function scene({ w = 160, h = 120, fovYDeg = 65, H = 1.4, pitchDeg = 40, rollDeg = 0, gx = 0, gy = 0, wallY = null, s = 0.5, t = 0.1 }) {
  const p = (pitchDeg * Math.PI) / 180;
  const q = (rollDeg * Math.PI) / 180;
  const zf = [0, Math.cos(p), -Math.sin(p)];
  const y0 = [0, -Math.sin(p), -Math.cos(p)];
  const x0 = [1, 0, 0];
  const xc = x0.map((v, i) => v * Math.cos(q) + y0[i] * Math.sin(q));
  const yc = y0.map((v, i) => -x0[i] * Math.sin(q) + v * Math.cos(q));
  const C = [0, 0, H];
  const tanH = Math.tan((fovYDeg * Math.PI) / 360);
  const aspect = w / h;
  const ray = (u, v) => {
    const rx = (u - 0.5) * 2 * tanH * aspect;
    const ry = (v - 0.5) * 2 * tanH;
    return [0, 1, 2].map((i) => rx * xc[i] + ry * yc[i] + zf[i]);
  };
  const hit = (u, v) => {
    const wd = ray(u, v);
    let lam = C[2] / (gx * wd[0] + gy * wd[1] - wd[2]);
    if (!(lam > 0)) lam = Infinity;
    if (wallY != null && wd[1] > 0) {
      const lw = wallY / wd[1];
      if (lw < lam) lam = lw;
    }
    return lam; // = z-depth because the camera-space ray has z = 1
  };
  const data = new Float32Array(w * h);
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const lam = hit((i + 0.5) / w, (j + 0.5) / h);
      const inv = Number.isFinite(lam) ? 1 / lam : 0;
      data[j * w + i] = (inv - t) / s;
    }
  }
  const down = [0, 0, -1];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const gravity = [dot(xc, down), dot(yc, down), dot(zf, down)];
  // project a world point to image (u, v)
  const project = (P) => {
    const d = [P[0] - C[0], P[1] - C[1], P[2] - C[2]];
    const c = [dot(d, xc), dot(d, yc), dot(d, zf)];
    return [c[0] / c[2] / (2 * tanH * aspect) + 0.5, c[1] / c[2] / (2 * tanH) + 0.5];
  };
  const ground = (X, Y) => [X, Y, gx * X + gy * Y];
  return { depth: { w, h, data }, gravity, project, ground };
}

const YARD = [[0.08, 0.35], [0.92, 0.35], [0.98, 0.97], [0.02, 0.97]];
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

function allFinite(t) {
  for (const v of t.z) if (!Number.isFinite(v)) return false;
  return true;
}

test('known gravity: recovers a 5.4% slope within 0.5 pp and the scale line within 1%', () => {
  const sc = scene({ gx: 0.02, gy: -0.05, rollDeg: 4 });
  const a = sc.project(sc.ground(-0.5, 4));
  const b = sc.project(sc.ground(0.5, 4));
  const r = toHeightfield({ depth: sc.depth, gravity: sc.gravity, yard: YARD, scale: { a, b, meters: 1 }, n: 96 });
  const truth = Math.hypot(0.02, 0.05) * 100;
  assert.equal(r.confidence.source, 'gravity');
  assert.ok(Math.abs(r.confidence.slopePct - truth) <= 0.5, `slope ${r.confidence.slopePct} vs ${truth}`);
  assert.ok(r.confidence.lowPct <= r.confidence.slopePct && r.confidence.slopePct <= r.confidence.highPct);
  assert.ok(Math.abs(dist(r.toGround(a), r.toGround(b)) - 1) <= 0.01);
  // an independent 2 m along the view direction (tests the depth-shift recovery, not the scale)
  const c = sc.project(sc.ground(0, 3));
  const d = sc.project(sc.ground(0, 5));
  assert.ok(Math.abs(dist(r.toGround(c), r.toGround(d)) - 2) <= 0.04, `2 m measured ${dist(r.toGround(c), r.toGround(d))}`);
  assert.ok(allFinite(r.terrain));
  assert.equal(r.terrain.z.length, r.terrain.nx * r.terrain.ny);
});

test('terrain grid: row 0 is the near edge, heights fall where the ground falls', () => {
  // ground falls away from the camera at 5%: far rows lower than near rows
  const sc = scene({ gy: -0.05 });
  const a = sc.project(sc.ground(-0.5, 4));
  const b = sc.project(sc.ground(0.5, 4));
  const r = toHeightfield({ depth: sc.depth, gravity: sc.gravity, yard: YARD, scale: { a, b, meters: 1 }, n: 64 });
  const { nx, ny, z } = r.terrain;
  const mid = Math.floor(nx / 2);
  assert.ok(z[mid] > z[(ny - 1) * nx + mid], 'near row is higher');
  // toGround of a nearer image point has a smaller y
  assert.ok(r.toGround([0.5, 0.9])[1] < r.toGround([0.5, 0.5])[1]);
  // x = right
  assert.ok(r.toGround([0.8, 0.7])[0] > r.toGround([0.2, 0.7])[0]);
});

test('toImage inverts toGround', () => {
  const sc = scene({ gx: 0.03, gy: 0.01 });
  const a = sc.project(sc.ground(-0.5, 4));
  const b = sc.project(sc.ground(0.5, 4));
  const r = toHeightfield({ depth: sc.depth, gravity: sc.gravity, yard: YARD, scale: { a, b, meters: 1 } });
  for (const uv of [[0.3, 0.5], [0.7, 0.9], [0.5, 0.6]]) {
    const back = r.toImage(r.toGround(uv));
    assert.ok(dist(back, uv) < 1e-6, `${back} vs ${uv}`);
  }
});

test('gravity + wall taps fix the depth shift without the camera-height prior', () => {
  const sc = scene({ H: 0.9, pitchDeg: 25, gy: -0.04, gx: 0.01, wallY: 9 });
  const a = sc.project(sc.ground(-0.5, 4));
  const b = sc.project(sc.ground(0.5, 4));
  const wallPts = [sc.project([-2, 9, 1.2]), sc.project([2, 9, 1.2]), sc.project([0, 9, 0.5])];
  const yard = [[0.05, 0.35], [0.95, 0.35], [0.98, 0.97], [0.02, 0.97]];
  const r = toHeightfield({ depth: sc.depth, gravity: sc.gravity, wallPts, yard, scale: { a, b, meters: 1 } });
  assert.equal(r.confidence.source, 'gravity');
  const truth = Math.hypot(0.04, 0.01) * 100;
  assert.ok(Math.abs(r.confidence.slopePct - truth) <= 0.5, `slope ${r.confidence.slopePct} vs ${truth}`);
  // no camera-height prior involved, so the band is only the fit + the 50% monocular term
  assert.ok(r.confidence.highPct - r.confidence.lowPct < 8, `band ${r.confidence.lowPct}..${r.confidence.highPct}`);
  assert.ok(!r.confidence.manualSuggested);
  assert.ok(Math.abs(r.meta.cameraHeightM - 0.9) < 0.05, `camera height ${r.meta.cameraHeightM}`);
});

test('gravity only: the band covers the camera-height uncertainty and still contains the truth', () => {
  const truth = Math.hypot(0.02, 0.05) * 100;
  for (const H of [1.25, 1.55]) {
    const sc = scene({ H, gx: 0.02, gy: -0.05 });
    const a = sc.project(sc.ground(-0.5, 4));
    const b = sc.project(sc.ground(0.5, 4));
    const r = toHeightfield({ depth: sc.depth, gravity: sc.gravity, yard: YARD, scale: { a, b, meters: 1 } });
    const c = r.confidence;
    assert.ok(c.lowPct <= truth && truth <= c.highPct, `H ${H}: ${c.lowPct}..${c.highPct} vs ${truth}`);
  }
});

test('no gravity, three wall taps: gravity from the wall plane + no roll', () => {
  const sc = scene({ pitchDeg: 25, gy: -0.05, wallY: 9 });
  const a = sc.project(sc.ground(-0.5, 4));
  const b = sc.project(sc.ground(0.5, 4));
  const wallPts = [sc.project([-2, 9, 1.2]), sc.project([2, 9, 1.2]), sc.project([0, 9, 0.5])];
  const yard = [[0.05, 0.35], [0.95, 0.35], [0.98, 0.97], [0.02, 0.97]];
  const r = toHeightfield({ depth: sc.depth, gravity: null, wallPts, yard, scale: { a, b, meters: 1 } });
  assert.equal(r.confidence.source, 'wall');
  assert.ok(Math.abs(r.confidence.slopePct - 5) <= 0.5, `slope ${r.confidence.slopePct}`);
});

test('no gravity, no wall: level-assumed with a wide band', () => {
  const sc = scene({ gy: -0.05 });
  const a = sc.project(sc.ground(-0.5, 4));
  const b = sc.project(sc.ground(0.5, 4));
  const r = toHeightfield({ depth: sc.depth, yard: YARD, scale: { a, b, meters: 1 } });
  const c = r.confidence;
  assert.equal(c.source, 'level-assumed');
  // ruling: [0, max(|slope| + 3, 12)] pp
  assert.equal(c.lowPct, 0);
  assert.ok(Math.abs(c.highPct - Math.max(Math.abs(c.slopePct) + 3, 12)) < 1e-9, `high ${c.highPct}`);
  assert.ok(c.manualSuggested);
  assert.ok(allFinite(r.terrain));
});

test('level-assumed with collinear wall taps: the true 5% lies inside the band, wall flagged unusable', () => {
  const sc = scene({ pitchDeg: 25, gy: -0.05, wallY: 9 });
  const a = sc.project(sc.ground(-0.5, 4));
  const b = sc.project(sc.ground(0.5, 4));
  const wallPts = [sc.project([-2, 9, 1.2]), sc.project([0, 9, 1.2]), sc.project([2, 9, 1.2])];
  const yard = [[0.05, 0.35], [0.95, 0.35], [0.98, 0.97], [0.02, 0.97]];
  const r = toHeightfield({ depth: sc.depth, gravity: null, wallPts, yard, scale: { a, b, meters: 1 } });
  const c = r.confidence;
  assert.equal(c.source, 'level-assumed');
  assert.ok(c.lowPct <= 5 && 5 <= c.highPct, `band ${c.lowPct}..${c.highPct}`);
  assert.ok(c.notes.some((s) => /wall unusable/.test(s)), c.notes.join('; '));
});

test('terrain.mask marks the in-yard cells', () => {
  const sc = scene({ gy: -0.05 });
  const a = sc.project(sc.ground(-0.5, 4));
  const b = sc.project(sc.ground(0.5, 4));
  const r = toHeightfield({ depth: sc.depth, gravity: sc.gravity, yard: [[0.3, 0.5], [0.7, 0.5], [0.5, 0.95]], scale: { a, b, meters: 1 }, n: 48 });
  const { mask, nx, ny } = r.terrain;
  assert.ok(mask instanceof Uint8Array);
  assert.equal(mask.length, nx * ny);
  let on = 0;
  for (const v of mask) on += v;
  // a triangle covers about half its bounding box
  assert.ok(on / (nx * ny) > 0.3 && on / (nx * ny) < 0.7, `${on} of ${nx * ny}`);
});

test('noise depth: finite terrain, wider band than clean, manual fallback suggested', () => {
  const sc = scene({ gx: 0.02, gy: -0.05 });
  const a = sc.project(sc.ground(-0.5, 4));
  const b = sc.project(sc.ground(0.5, 4));
  const clean = toHeightfield({ depth: sc.depth, gravity: sc.gravity, yard: YARD, scale: { a, b, meters: 1 } });
  let seed = 7;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
  for (const mode of ['pure', 'added']) {
    const data = new Float32Array(sc.depth.data.length);
    for (let i = 0; i < data.length; i++) data[i] = mode === 'pure' ? rnd() : sc.depth.data[i] + (rnd() - 0.5) * 0.6;
    const r = toHeightfield({ depth: { ...sc.depth, data }, gravity: sc.gravity, yard: YARD, scale: { a, b, meters: 1 } });
    assert.ok(allFinite(r.terrain), mode);
    const c = r.confidence;
    for (const v of [c.slopePct, c.lowPct, c.highPct]) assert.ok(Number.isFinite(v), mode);
    assert.ok(c.highPct - c.lowPct > clean.confidence.highPct - clean.confidence.lowPct, `${mode}: ${c.highPct - c.lowPct} vs clean`);
    assert.ok(c.manualSuggested, mode);
  }
});

test('a tiny yard polygon stays finite and widens the band', () => {
  const sc = scene({ gx: 0.02, gy: -0.05 });
  const a = sc.project(sc.ground(-0.5, 4));
  const b = sc.project(sc.ground(0.5, 4));
  const base = { depth: sc.depth, gravity: sc.gravity, scale: { a, b, meters: 1 } };
  const big = toHeightfield({ ...base, yard: YARD });
  const tiny = toHeightfield({ ...base, yard: [[0.5, 0.7], [0.52, 0.7], [0.51, 0.715]] });
  assert.ok(allFinite(tiny.terrain));
  assert.ok(tiny.confidence.highPct - tiny.confidence.lowPct > big.confidence.highPct - big.confidence.lowPct);
  assert.ok(tiny.confidence.manualSuggested);
  // degenerate: empty polygon, zero-length scale
  const deg = toHeightfield({ ...base, yard: [], scale: { a, b: a, meters: 1 } });
  assert.ok(allFinite(deg.terrain));
  assert.ok(deg.confidence.manualSuggested);
});
