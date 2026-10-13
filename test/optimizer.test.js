import { test } from 'node:test';
import assert from 'node:assert/strict';
import { optimize, evaluateGarden } from '../src/garden/optimizer.js';
import { forbiddenMask, applyGarden } from '../src/garden/constraints.js';
import { costOf, gardenArea } from '../src/garden/cost.js';
import { edgeMask } from '../src/sim/grid.js';
import { hyetograph } from '../src/sim/storm.js';
import { mulberry32 } from '../src/garden/rng.js';

const STEP_S = 300;
const STORM = { mm: hyetograph(30, 'IA', 24, STEP_S), stepS: STEP_S };

function makeTerrain(nx, ny, cell, f) {
  const z = new Float64Array(nx * ny);
  for (let y = 0; y < ny; y++) for (let x = 0; x < nx; x++) z[y * nx + x] = f((x + 0.5) * cell, (y + 0.5) * cell);
  return { nx, ny, cell, z };
}

/** House along the top edge (y = 0); a roof mask strip, downspout just below it. */
function simParamsFor(t, soil = 'loam', downspoutX = null) {
  const { nx, ny, cell } = t;
  const imperv = new Uint8Array(nx * ny);
  for (let x = 0; x < nx; x++) imperv[x] = 1;
  const dx = downspoutX === null ? Math.floor(nx / 2) : Math.floor(downspoutX / cell);
  return {
    soil, imperv, outlet: edgeMask(nx, ny),
    roof: { areaM2: 60, cell: 1 * nx + dx, mask: imperv },
  };
}

/** Independent full-resolution legality check, straight from the brief's rules. */
function assertLegal(terrain, forbidden, g, limits, prices) {
  const { mask, bermMask } = applyGarden(terrain, g);
  let cells = 0;
  for (let i = 0; i < mask.length; i++) {
    if (mask[i]) cells++;
    assert.ok(!((mask[i] || bermMask[i]) && forbidden[i]), `garden/berm cell ${i} is forbidden`);
  }
  assert.ok(cells > 0, 'garden has at least one cell');
  assert.ok(g.lenM >= 0.6 - 1e-12 && g.widM >= 0.6 - 1e-12, 'axes >= 0.6 m');
  assert.ok(Math.max(g.lenM, g.widM) / Math.min(g.lenM, g.widM) <= 3 + 1e-9, 'aspect <= 3');
  assert.ok(g.depthM >= (limits.minDepthM ?? 0.1) - 1e-12 && g.depthM <= (limits.maxDepthM ?? 0.3) + 1e-12, 'depth in range');
  assert.ok(g.bermM >= 0 && g.bermM <= (limits.maxBermM ?? 0.15) + 1e-12, 'berm in range');
  if (limits.maxAreaM2 !== undefined) assert.ok(gardenArea(g) <= limits.maxAreaM2 + 1e-9, 'area <= max');
  if (limits.budget !== undefined) assert.ok(costOf(g, prices).total <= limits.budget + 1e-9, 'cost <= budget');
}

/** A valley running down the yard (toward +y), downspout at its head. */
function valleyCase() {
  const W = 12;
  const t = makeTerrain(48, 48, 0.25, (x, y) => -0.04 * y + 0.12 * Math.abs(x - W / 2) / (W / 2) - 0.02 * Math.cos(x));
  const site = { yard: [[0, 0], [W, 0], [W, W], [0, W]], wall: [[0, 0], [W, 0]], septic: null };
  return { t, site, forbidden: forbiddenMask(t, site), simParams: simParamsFor(t, 'loam', W / 2) };
}

test('never inside a forbidden zone (200 random yards with random wall/septic)', () => {
  const rnd = mulberry32(2026);
  let oks = 0;
  for (let k = 0; k < 200; k++) {
    const N = 32;
    const cell = 0.3;
    const W = N * cell;
    const a = (rnd() - 0.5) * 0.1;
    const b = 0.02 + rnd() * 0.08;
    const bx = rnd() * W;
    const by = rnd() * W;
    const dip = rnd() * 0.2;
    const t = makeTerrain(N, N, cell, (x, y) => (a * x) / W - (b * y) / W
      - dip * Math.exp(-((x - bx) ** 2 + (y - by) ** 2) / 4));
    const inset = rnd() * 1.5;
    const yard = [[inset, 0], [W - inset * rnd(), 0], [W - inset * rnd(), W - inset], [inset * rnd(), W - inset * rnd()]];
    const wy = rnd() * 2;
    const wall = [[0, wy], [W * (0.4 + 0.6 * rnd()), wy]];
    let septic = null;
    if (rnd() < 0.5) {
      const sx = rnd() * W;
      const sy = 3 + rnd() * (W - 3);
      const s = 0.5 + rnd() * 2;
      septic = [[sx, sy], [sx + s, sy], [sx + s, sy + s], [sx, sy + s]];
    }
    const site = { yard, wall, septic, minWallM: 1 + rnd() * 3 };
    const forbidden = forbiddenMask(t, site);
    const limits = { maxAreaM2: 1 + rnd() * 8, budget: 50 + rnd() * 900 };
    const r = optimize({
      terrain: t, forbidden, site, simParams: simParamsFor(t, rnd() < 0.5 ? 'loam' : 'sand'), storm: STORM,
      limits, prior: { areaM2: 1 + rnd() * 6 }, iters: 12, seed: k + 1,
    });
    if (r.ok) {
      oks++;
      assertLegal(t, forbidden, r.garden, limits);
    } else {
      assert.equal(typeof r.reason, 'string');
      assert.ok(r.reason.length > 0);
    }
  }
  assert.ok(oks >= 100, `most random yards admit a garden (${oks}/200)`);
});

test('returns ok:false with a reason when everything is forbidden', () => {
  const { t, simParams } = valleyCase();
  const forbidden = new Uint8Array(t.nx * t.ny).fill(1);
  const r = optimize({ terrain: t, forbidden, simParams, storm: STORM, limits: { maxAreaM2: 10, budget: 2000 }, prior: { areaM2: 4 }, iters: 5, seed: 1 });
  assert.equal(r.ok, false);
  assert.equal(typeof r.reason, 'string');
  assert.ok(r.reason.length > 0);
});

test('ok:false reasons name the binding constraint', () => {
  const { t, simParams } = valleyCase();
  const base = { terrain: t, simParams, storm: STORM, prior: { areaM2: 4 }, iters: 3, seed: 1 };
  const W = 12;
  // house wall buffer covers the whole yard
  const wallSite = { yard: [[0, 0], [W, 0], [W, 4], [0, 4]], wall: [[0, 0], [W, 0]], septic: null, minWallM: 3 };
  let r = optimize({ ...base, site: wallSite, forbidden: forbiddenMask(t, wallSite), limits: { maxAreaM2: 10, budget: 2000 } });
  assert.equal(r.ok, false);
  assert.match(r.reason, /within 3 m of the house/);
  // septic buffer covers the yard
  const sepSite = { yard: [[0, 0], [W, 0], [W, W], [0, W]], wall: [[0, 0], [W, 0]], septic: [[4, 7], [8, 7], [8, 9], [4, 9]] };
  r = optimize({ ...base, site: sepSite, forbidden: forbiddenMask(t, sepSite), limits: { maxAreaM2: 10, budget: 2000 } });
  assert.equal(r.ok, false);
  assert.match(r.reason, /septic buffer covers the yard/);
  // yard too small
  const tinySite = { yard: [[5, 5], [6, 5], [6, 6], [5, 6]], wall: null, septic: null };
  r = optimize({ ...base, site: tinySite, forbidden: forbiddenMask(t, tinySite), limits: { maxAreaM2: 10, budget: 2000 } });
  assert.equal(r.ok, false);
  assert.match(r.reason, /yard is too small/);
  // budget
  const { site, forbidden } = valleyCase();
  r = optimize({ ...base, site, forbidden, limits: { maxAreaM2: 10, budget: 5 } });
  assert.equal(r.ok, false);
  assert.match(r.reason, /budget too small for the smallest garden/);
});

test('beats a random legal placement on a valley yard', () => {
  const { t, forbidden, simParams } = valleyCase();
  const limits = { maxAreaM2: 6, budget: 1500 };
  const r = optimize({ terrain: t, forbidden, simParams, storm: STORM, limits, prior: { areaM2: 3 }, iters: 60, seed: 7 });
  assert.equal(r.ok, true);
  assert.ok(r.capturedL > 0, `captures water (${r.capturedL})`);
  // the same garden at random legal centres (legal includes the 48 h drawdown)
  const rnd = mulberry32(99);
  const caps = [];
  for (let k = 0; k < 400 && caps.length < 8; k++) {
    const g = { ...r.garden, cx: 0.5 + rnd() * 11, cy: 0.5 + rnd() * 11 };
    const { mask, bermMask } = applyGarden(t, g);
    let bad = false;
    for (let i = 0; i < mask.length; i++) if ((mask[i] || bermMask[i]) && forbidden[i]) { bad = true; break; }
    if (bad) continue;
    const e = evaluateGarden({ terrain: t, simParams, storm: STORM, garden: g });
    if (e.drainH > 48) continue;
    caps.push(e.capturedL);
  }
  assert.ok(caps.length >= 5, 'found random legal placements');
  caps.sort((a, b) => a - b);
  const mean = caps.reduce((a, b) => a + b, 0) / caps.length;
  const msg = `optimizer ${r.capturedL.toFixed(0)} L vs random ${caps.map((c) => c.toFixed(0)).join(', ')}`;
  assert.ok(r.capturedL > mean, `beats the random mean: ${msg}`);
  assert.ok(r.capturedL >= caps[caps.length >> 1], `beats the random median: ${msg}`);
});

test('respects budget and maxArea (every try and the result)', () => {
  const { t, forbidden, simParams } = valleyCase();
  const limits = { maxAreaM2: 2, budget: 250 };
  const seen = [];
  const r = optimize({
    terrain: t, forbidden, simParams, storm: STORM, limits, prior: { areaM2: 8 }, iters: 30, seed: 3,
    onTry: (tr) => seen.push(tr.garden),
  });
  assert.equal(r.ok, true);
  for (const g of [...seen, r.garden]) {
    assert.ok(gardenArea(g) <= 2 + 1e-9);
    assert.ok(costOf(g).total <= 250 + 1e-9);
  }
  assert.ok(r.cost.total <= 250 + 1e-9);
});

test('the returned garden is legal at full resolution', () => {
  const { t, forbidden, simParams } = valleyCase();
  const limits = { maxAreaM2: 5, budget: 1000, minDepthM: 0.12, maxDepthM: 0.25, maxBermM: 0.1 };
  const r = optimize({ terrain: t, forbidden, simParams, storm: STORM, limits, prior: { areaM2: 3 }, iters: 30, seed: 11 });
  assert.equal(r.ok, true);
  assertLegal(t, forbidden, r.garden, limits);
});

test('deterministic for a seed', () => {
  const { t, forbidden, simParams } = valleyCase();
  const args = { terrain: t, forbidden, simParams, storm: STORM, limits: { maxAreaM2: 5, budget: 1000 }, prior: { areaM2: 3 }, iters: 20 };
  const a = optimize({ ...args, seed: 5 });
  const b = optimize({ ...args, seed: 5 });
  assert.deepEqual(a, b);
});

test('drainH <= 48 for the returned garden on loam, and capturedL = before - after', () => {
  const { t, forbidden, simParams } = valleyCase();
  const r = optimize({ terrain: t, forbidden, simParams, storm: STORM, limits: { maxAreaM2: 6, budget: 1500 }, prior: { areaM2: 3 }, iters: 30, seed: 2 });
  assert.equal(r.ok, true);
  assert.ok(r.drainH <= 48, `drainH ${r.drainH}`);
  assert.ok(Math.abs(r.capturedL - (r.outBeforeL - r.outAfterL)) < 1e-9);
  assert.ok(r.outBeforeL > 0);
});

test('onTry is called once per evaluation', () => {
  const { t, forbidden, simParams } = valleyCase();
  const calls = [];
  const r = optimize({
    terrain: t, forbidden, simParams, storm: STORM, limits: { maxAreaM2: 5, budget: 1000 }, prior: { areaM2: 3 }, iters: 15, seed: 4,
    onTry: (tr) => calls.push(tr),
  });
  assert.equal(r.ok, true);
  assert.equal(calls.length, r.tries);
  assert.ok(r.tries >= 2 && r.tries <= 16);
  calls.forEach((c, k) => {
    assert.equal(typeof c.i, 'number');
    assert.equal(typeof c.accepted, 'boolean');
    assert.ok(Number.isFinite(c.outAfterL));
    assert.ok(c.best && c.best.garden);
    if (k > 0) assert.ok(c.i > calls[k - 1].i);
  });
});

test('uphill water enters the garden instead of running round the berm top', () => {
  // Regression: applyGarden used to raise the whole berm ring to exactly the
  // pond's lip, a flat at spill level that priority-flood routed the roof
  // water along, past an empty garden.
  const { t, simParams } = valleyCase();
  const g = { cx: 6.8213, cy: 8.0169, lenM: 1.951, widM: 1.895, rot: 0.1192, depthM: 0.1253, bermM: 0.0564 };
  const e = evaluateGarden({ terrain: t, simParams, storm: STORM, garden: g });
  assert.ok(e.capturedL > 100, `captured ${e.capturedL} L`);
});
